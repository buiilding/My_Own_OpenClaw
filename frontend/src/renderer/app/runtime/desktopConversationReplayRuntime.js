/**
 * Provides renderer conversation replay projection helpers.
 */

import { DesktopConversationRuntimeContracts } from './desktopConversationRuntimeContracts';
import { DesktopPendingTurnBridgeRuntime } from './desktopPendingTurnBridgeRuntime';
import { DesktopConversationContinuityService } from './desktopConversationContinuityService';
import {
  DesktopConversationSessionRuntime,
} from './desktopConversationSessionRuntime';
import {
  DesktopConversationProjectionStreamRuntime,
} from './desktopConversationProjectionStreamRuntime';
import { DesktopPendingTurnRuntimeClient } from './desktopPendingTurnRuntimeClient';
import { DesktopRendererTraceRuntime } from './desktopRendererTraceRuntime';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from './desktopWorkspaceRuntimeClient';

const {
  resolveCorrelationId,
  resolveToolBundleCorrelationId,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
} = DesktopConversationRuntimeContracts;
const {
  applyRendererConversationSelection,
  createConversationRef,
  initializeLocalConversationSession,
  resolveRendererConversationSessionSnapshot,
} = DesktopConversationSessionRuntime;
const {
  mergePendingTurnUserMessage,
} = DesktopPendingTurnBridgeRuntime;
const {
  logRendererReplayTrace,
} = DesktopRendererTraceRuntime;
const {
  buildReplayProjectionTracePayload,
} = DesktopConversationProjectionStreamRuntime;

const TOOL_CALL_MESSAGE_TYPES = new Set(['tool-call', 'tool-bundle']);
const TOOL_OUTPUT_MESSAGE_TYPES = new Set(['tool-output']);

function normalizeReplayMessageType(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }
  return typeof message.type === 'string'
    ? message.type.trim().toLowerCase()
    : '';
}

function resolveReplayToolMessageCorrelationId(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }
  const messageType = normalizeReplayMessageType(message);
  const toolCallDetailsId = (
    message.toolCallDetails
    && typeof message.toolCallDetails === 'object'
    && !Array.isArray(message.toolCallDetails)
    && typeof message.toolCallDetails.id === 'string'
      ? message.toolCallDetails.id
      : null
  );
  const toolOutputDetailsId = (
    message.toolOutputDetails
    && typeof message.toolOutputDetails === 'object'
    && !Array.isArray(message.toolOutputDetails)
    && typeof message.toolOutputDetails.id === 'string'
      ? message.toolOutputDetails.id
      : null
  );
  const sdkResolvedId = messageType === 'tool-bundle'
    ? resolveToolBundleCorrelationId(message.toolCallDetails)
    : (
        messageType === 'tool-output'
          ? resolveToolOutputCorrelationId(message.toolOutputDetails)
          : resolveToolCallCorrelationId(message.toolCallDetails)
      );
  return resolveCorrelationId(
    message.correlationId,
    sdkResolvedId,
    toolCallDetailsId,
    toolOutputDetailsId,
    message?.modelFacingToolCall?.id,
  );
}

function isReplayToolCallMessage(message) {
  return TOOL_CALL_MESSAGE_TYPES.has(normalizeReplayMessageType(message));
}

function isReplayToolOutputMessage(message) {
  return TOOL_OUTPUT_MESSAGE_TYPES.has(normalizeReplayMessageType(message));
}

function isReplayUserMessage(message) {
  return message?.sender === 'user';
}

function isReplayAssistantMessage(message) {
  return message?.sender === 'assistant';
}

function findReplayEditableUserMessageIndex(messages, userMessageId) {
  if (!Array.isArray(messages) || typeof userMessageId !== 'string' || !userMessageId) {
    return -1;
  }
  return messages.findIndex(
    (message) => message?.id === userMessageId && isReplayUserMessage(message),
  );
}

function resolveReplayRetryMessageIndexes(messages, assistantMessageId) {
  if (!Array.isArray(messages) || typeof assistantMessageId !== 'string' || !assistantMessageId) {
    return { assistantIndex: -1, userIndex: -1 };
  }
  const assistantIndex = messages.findIndex(
    (message) => message?.id === assistantMessageId && isReplayAssistantMessage(message),
  );
  if (assistantIndex < 0) {
    return { assistantIndex: -1, userIndex: -1 };
  }
  for (let index = assistantIndex; index >= 0; index -= 1) {
    if (isReplayUserMessage(messages[index])) {
      return { assistantIndex, userIndex: index };
    }
  }
  return { assistantIndex, userIndex: -1 };
}

function findMatchingPendingToolCallIndex(pendingCalls, outputCorrelationId) {
  if (!Array.isArray(pendingCalls) || pendingCalls.length === 0) {
    return -1;
  }

  if (outputCorrelationId) {
    const sameIdIndex = pendingCalls.findIndex((entry) => entry.correlationId === outputCorrelationId);
    if (sameIdIndex >= 0) {
      return sameIdIndex;
    }
    const idlessIndex = pendingCalls.findIndex((entry) => !entry.correlationId);
    if (idlessIndex >= 0) {
      return idlessIndex;
    }
    return -1;
  }

  const idlessIndex = pendingCalls.findIndex((entry) => !entry.correlationId);
  if (idlessIndex >= 0) {
    return idlessIndex;
  }
  return -1;
}

function buildReplayContextMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const pendingToolCalls = [];
  const keepToolMessageIndexes = new Set();

  messages.forEach((message, index) => {
    if (isReplayToolCallMessage(message)) {
      pendingToolCalls.push({
        index,
        correlationId: resolveReplayToolMessageCorrelationId(message),
      });
      return;
    }
    if (!isReplayToolOutputMessage(message)) {
      return;
    }
    const outputCorrelationId = resolveReplayToolMessageCorrelationId(message);
    const pendingIndex = findMatchingPendingToolCallIndex(
      pendingToolCalls,
      outputCorrelationId,
    );
    if (pendingIndex < 0) {
      return;
    }
    const [matchedCall] = pendingToolCalls.splice(pendingIndex, 1);
    keepToolMessageIndexes.add(matchedCall.index);
    keepToolMessageIndexes.add(index);
  });

  return messages.filter((message, index) => {
    if (!isReplayToolCallMessage(message) && !isReplayToolOutputMessage(message)) {
      return true;
    }
    return keepToolMessageIndexes.has(index);
  });
}

function buildReplayPendingTurn({
  attachmentFilenames = null,
  conversationRef,
  text,
  timestamp,
  turnRef,
  userMessageId,
}) {
  const normalizedUserMessageId = typeof userMessageId === 'string' && userMessageId.trim()
    ? userMessageId.trim()
    : `${turnRef}-sdk-evt-000002-user_message`;
  return {
    conversationRef,
    turnRef,
    userMessageId: normalizedUserMessageId,
    text,
    timestamp,
    attachmentFilenames: Array.isArray(attachmentFilenames) && attachmentFilenames.length > 0
      ? attachmentFilenames
      : null,
  };
}

function buildReplayMessagesWithPendingTurn(messages, pendingTurn) {
  return mergePendingTurnUserMessage(messages, pendingTurn);
}

function resolveReplaySupersededTurnRef(sourceUserMessage, replayTurnRef) {
  const sourceTurnRef = typeof sourceUserMessage?.turnRef === 'string'
    ? sourceUserMessage.turnRef.trim()
    : '';
  return sourceTurnRef && sourceTurnRef !== replayTurnRef ? sourceTurnRef : null;
}

function buildReplayPendingPublication({
  conversationRef,
  replayMessages,
  sourceUserMessage,
  text,
  timestamp,
  turnRef,
}) {
  const pendingTurn = buildReplayPendingTurn({
    attachmentFilenames: sourceUserMessage?.attachmentFilenames ?? null,
    conversationRef,
    turnRef,
    text,
    timestamp,
  });
  return {
    pendingTurn,
    messages: buildReplayMessagesWithPendingTurn(replayMessages, pendingTurn),
    supersededTurnRef: resolveReplaySupersededTurnRef(sourceUserMessage, turnRef),
  };
}

function prepareReplayEditIntent({ messages, userMessageId, editedText }) {
  const normalizedEditedText = typeof editedText === 'string'
    ? editedText.trim()
    : '';
  if (!normalizedEditedText) {
    return null;
  }
  const userIndex = findReplayEditableUserMessageIndex(messages, userMessageId);
  if (userIndex < 0) {
    return null;
  }
  const sourceUserMessage = {
    ...messages[userIndex],
    text: normalizedEditedText,
  };
  return {
    action: 'edit_resend',
    errorPrefix: 'Failed to edit user message',
    messageId: userMessageId,
    queryText: normalizedEditedText,
    replayMessages: buildReplayContextMessages(messages.slice(0, userIndex)),
    sourceUserMessage,
    targetUserMessageId: userMessageId,
  };
}

function prepareReplayRetryIntent({ messages, assistantMessageId }) {
  const { userIndex } = resolveReplayRetryMessageIndexes(messages, assistantMessageId);
  if (userIndex < 0) {
    return null;
  }
  const sourceUserMessage = messages[userIndex];
  return {
    action: 'retry',
    errorPrefix: 'Failed to retry assistant message',
    messageId: assistantMessageId,
    queryText: sourceUserMessage.text,
    replayMessages: buildReplayContextMessages(messages.slice(0, userIndex)),
    sourceUserMessage,
    targetUserMessageId: sourceUserMessage.id,
  };
}

function ensureConversationRef(sessionConversationRef, storeConversationRef) {
  let conversationRef = resolveRendererConversationSessionSnapshot({
    transcriptConversationRef: DesktopTranscriptSessionRuntimeClient.getActiveConversationRef() || sessionConversationRef,
    storeConversationRef,
  }).conversationRef;
  if (!conversationRef) {
    conversationRef = initializeLocalConversationSession({
      createConversationRef,
      selectConversationRef: (nextConversationRef) => {
        applyRendererConversationSelection({
          conversationRef: nextConversationRef,
          updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
        });
      },
      onConversationCreated: (nextConversationRef) => {
        DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding(nextConversationRef, null);
      },
    });
  }
  return conversationRef;
}

function traceErrorKind(error) {
  if (!error) {
    return null;
  }
  if (typeof error.name === 'string' && error.name.trim()) {
    return error.name.trim();
  }
  return error instanceof Error ? 'Error' : typeof error;
}

function replayTraceSnapshot(chatStore, conversationRef, newTurnRef = null, oldTurnRef = null) {
  const state = chatStore.getState();
  const workspace = typeof state.getWorkspaceState === 'function'
    ? state.getWorkspaceState(conversationRef)
    : state;
  const tracePayload = buildReplayProjectionTracePayload({
    action: 'replay_trace_snapshot',
    conversationRef,
    workspace,
    values: {
      newTurnRef,
      oldTurnRef,
    },
  });
  return Object.fromEntries(
    Object.entries(tracePayload).filter(
      ([key]) => key !== 'action' && key !== 'conversationRef',
    ),
  );
}

function logReplayTimeline(chatStore, action, {
  conversationRef,
  newTurnRef = null,
  oldTurnRef = null,
  ...values
}) {
  logRendererReplayTrace({
    action,
    conversationRef,
    oldTurnRef,
    newTurnRef,
    ...replayTraceSnapshot(chatStore, conversationRef, newTurnRef, oldTurnRef),
    ...values,
  });
}

async function executeReplayIntent({
  activeConversationRef,
  addMessage,
  chatStore,
  deferredQueryModelSelection,
  failureMessages = {},
  intent,
  sessionInfo,
}) {
  if (!intent || !chatStore || typeof chatStore.getState !== 'function') {
    return false;
  }
  const {
    action,
    errorPrefix,
    messageId,
    queryText,
    replayMessages,
    sourceUserMessage,
    targetUserMessageId,
  } = intent;
  const conversationRef = ensureConversationRef(
    sessionInfo.conversationRef,
    activeConversationRef,
  );
  const workspaceBinding = DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding(conversationRef);
  applyRendererConversationSelection({
    conversationRef,
    userId: sessionInfo.userId || undefined,
    updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
  });
  const replayTurnRef = crypto.randomUUID();
  let pendingTurnPublished = false;
  let supersededTurnRef = null;
  logReplayTimeline(chatStore, 'replay_start', {
    conversationRef,
    newTurnRef: replayTurnRef,
    targetUserMessageId,
  });
  try {
    const sdkReplayPayload = {
      ...(workspaceBinding.workspacePath ? { workspace_path: workspaceBinding.workspacePath } : {}),
    };
    const replayStartedAt = new Date().toISOString();
    const pendingPublication = buildReplayPendingPublication({
      conversationRef,
      replayMessages,
      sourceUserMessage,
      turnRef: replayTurnRef,
      text: queryText,
      timestamp: replayStartedAt,
    });
    supersededTurnRef = pendingPublication.supersededTurnRef;
    chatStore.getState().acceptReplayPendingTurn({
      conversationRef,
      messages: pendingPublication.messages,
      pendingTurn: pendingPublication.pendingTurn,
      supersededTurnRef,
    });
    DesktopPendingTurnRuntimeClient.setPending(pendingPublication.pendingTurn);
    pendingTurnPublished = true;
    logReplayTimeline(chatStore, 'pending_published', {
      conversationRef,
      oldTurnRef: supersededTurnRef,
      newTurnRef: replayTurnRef,
      targetUserMessageId,
    });
    try {
      logReplayTimeline(chatStore, 'sdk_replay_sent', {
        conversationRef,
        oldTurnRef: supersededTurnRef,
        newTurnRef: replayTurnRef,
        action,
        targetUserMessageId,
      });
      if (action === 'edit_resend') {
        await DesktopConversationContinuityService.editAndResend({
          userId: sessionInfo.userId,
          conversationRef,
          messageId: targetUserMessageId,
          text: queryText,
          turnRef: replayTurnRef,
          payload: sdkReplayPayload,
          model: deferredQueryModelSelection || undefined,
        });
      } else {
        await DesktopConversationContinuityService.retryTurn({
          userId: sessionInfo.userId,
          conversationRef,
          messageId,
          turnRef: replayTurnRef,
          payload: sdkReplayPayload,
          model: deferredQueryModelSelection || undefined,
        });
      }
      logReplayTimeline(chatStore, 'sdk_replay_done', {
        conversationRef,
        oldTurnRef: supersededTurnRef,
        newTurnRef: replayTurnRef,
        action,
        replaySucceeded: true,
        targetUserMessageId,
      });
    } catch (sdkReplayError) {
      logReplayTimeline(chatStore, 'sdk_replay_failed', {
        conversationRef,
        oldTurnRef: supersededTurnRef,
        newTurnRef: replayTurnRef,
        action,
        replaySucceeded: false,
        errorKind: traceErrorKind(sdkReplayError),
        targetUserMessageId,
      });
      if (sdkReplayError && typeof sdkReplayError === 'object') {
        sdkReplayError.__desktopRuntimeReplayStep = 'send';
      }
      throw sdkReplayError;
    }
    return true;
  } catch (error) {
    console.error(`[ChatInterface] ${errorPrefix}:`, error);
    chatStore.getState().clearPendingTurn({
      conversationRef,
      turnRef: replayTurnRef,
    });
    DesktopPendingTurnRuntimeClient.clear({
      conversationRef,
      turnRef: replayTurnRef,
    });
    if (pendingTurnPublished) {
      chatStore.getState().setMessages(
        Array.isArray(replayMessages) ? replayMessages : [],
        conversationRef,
      );
    }
    logReplayTimeline(chatStore, 'replay_failed_cleanup', {
      conversationRef,
      oldTurnRef: supersededTurnRef,
      newTurnRef: replayTurnRef,
      errorKind: traceErrorKind(error),
      targetUserMessageId,
    });
    if (typeof addMessage === 'function') {
      const replayStep = error?.__desktopRuntimeReplayStep === 'send' ? 'send' : 'prepare';
      addMessage({
        id: crypto.randomUUID(),
        text: replayStep === 'send'
          ? failureMessages.sendFailureMessage
          : failureMessages.replayPreparationFailureMessage,
        sender: 'assistant',
        type: 'error',
        sourceEventType: 'renderer-replay',
        sourceChannel: 'renderer-local',
        isComplete: true,
      }, conversationRef);
    }
    return false;
  }
}

function prepareReplayActionIntent({
  action,
  assistantMessageId,
  editedText,
  messages,
  userMessageId,
}) {
  if (action === 'edit_resend') {
    return prepareReplayEditIntent({ messages, userMessageId, editedText });
  }
  if (action === 'retry') {
    return prepareReplayRetryIntent({ messages, assistantMessageId });
  }
  return null;
}

async function executeReplayAction({
  action,
  activeConversationRef,
  addMessage,
  assistantMessageId = null,
  chatStore,
  deferredQueryModelSelection,
  editedText = null,
  failureMessages = {},
  messages = [],
  sessionInfo = null,
  userMessageId = null,
}) {
  const intent = prepareReplayActionIntent({
    action,
    assistantMessageId,
    editedText,
    messages,
    userMessageId,
  });
  if (!intent) {
    return undefined;
  }
  const resolvedSessionInfo = sessionInfo
    || DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
  return executeReplayIntent({
    activeConversationRef,
    addMessage,
    chatStore,
    deferredQueryModelSelection,
    failureMessages,
    intent,
    sessionInfo: resolvedSessionInfo,
  });
}

export const DesktopConversationReplayRuntime = Object.freeze({
  buildReplayPendingPublication,
  executeReplayAction,
  executeReplayIntent,
  prepareReplayEditIntent,
  prepareReplayRetryIntent,
});
