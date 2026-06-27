/**
 * Provides renderer conversation replay projection helpers.
 */

import { DesktopConversationContinuityService } from './desktopConversationContinuityService';
import {
  DesktopConversationSessionRuntime,
} from './desktopConversationSessionRuntime';
import {
  DesktopConversationProjectionStreamRuntime,
} from './desktopConversationProjectionStreamRuntime';
import { DesktopRendererConfigRuntimeClient } from './desktopRendererConfigRuntimeClient';
import { DesktopSettingsRuntimeClient } from './desktopSettingsRuntimeClient';
import {
  projectWorkspaceReadModelState,
} from './desktopChatWorkspaceStateRuntime';
import { DesktopRendererTraceRuntime } from './desktopRendererTraceRuntime';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from './desktopWorkspaceRuntimeClient';

const {
  applyRendererConversationSelection,
  resolveRendererConversationSessionSnapshot,
} = DesktopConversationSessionRuntime;
const {
  logRendererReplayTrace,
} = DesktopRendererTraceRuntime;
const {
  buildReplayProjectionTracePayload,
} = DesktopConversationProjectionStreamRuntime;

function normalizeReplayMessageId(messageId) {
  return typeof messageId === 'string' ? messageId.trim() : '';
}

function prepareReplayEditIntent({ userMessageId, editedText }) {
  const normalizedEditedText = typeof editedText === 'string'
    ? editedText.trim()
    : '';
  const normalizedMessageId = normalizeReplayMessageId(userMessageId);
  if (!normalizedEditedText || !normalizedMessageId) {
    return null;
  }
  return {
    action: 'edit_resend',
    errorPrefix: 'Failed to edit user message',
    messageId: normalizedMessageId,
    queryText: normalizedEditedText,
  };
}

function prepareReplayRetryIntent({ assistantMessageId }) {
  const normalizedMessageId = normalizeReplayMessageId(assistantMessageId);
  if (!normalizedMessageId) {
    return null;
  }
  return {
    action: 'retry',
    errorPrefix: 'Failed to retry assistant message',
    messageId: normalizedMessageId,
  };
}

function resolveExistingConversationRef(sessionConversationRef, storeConversationRef) {
  return resolveRendererConversationSessionSnapshot({
    transcriptConversationRef: DesktopTranscriptSessionRuntimeClient.getActiveConversationRef() || sessionConversationRef,
    storeConversationRef,
  }).conversationRef;
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

function replayTraceSnapshot(chatStore, conversationRef) {
  const state = chatStore.getState();
  const rawWorkspace = typeof state.getWorkspaceState === 'function'
    ? state.getWorkspaceState(conversationRef)
    : state;
  const workspace = projectWorkspaceReadModelState(rawWorkspace);
  const tracePayload = buildReplayProjectionTracePayload({
    action: 'replay_trace_snapshot',
    conversationRef,
    workspace,
  });
  return Object.fromEntries(
    Object.entries(tracePayload).filter(
      ([key]) => key !== 'action' && key !== 'conversationRef',
    ),
  );
}

function logReplayTimeline(chatStore, action, {
  conversationRef,
  ...values
}) {
  logRendererReplayTrace({
    action,
    conversationRef,
    ...replayTraceSnapshot(chatStore, conversationRef),
    ...values,
  });
}

async function executeReplayIntent({
  activeConversationRef,
  chatStore,
  deferredQueryModelSelection,
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
  } = intent;
  const conversationRef = resolveExistingConversationRef(
    sessionInfo.conversationRef,
    activeConversationRef,
  );
  if (!conversationRef) {
    console.error(`[ChatInterface] ${errorPrefix}: missing active conversation`);
    logRendererReplayTrace({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingConversationRef',
      targetUserMessageId: messageId,
    });
    return false;
  }
  const workspaceBinding = DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding(conversationRef);
  applyRendererConversationSelection({
    conversationRef,
    userId: sessionInfo.userId || undefined,
    updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
  });
  logReplayTimeline(chatStore, 'replay_start', {
    conversationRef,
    targetUserMessageId: messageId,
  });
  try {
    const sdkReplayPayload = {
      ...(workspaceBinding.workspacePath ? { workspace_path: workspaceBinding.workspacePath } : {}),
    };
    try {
      if (deferredQueryModelSelection) {
        await DesktopSettingsRuntimeClient.setModel(deferredQueryModelSelection);
      }
      logReplayTimeline(chatStore, 'sdk_replay_sent', {
        conversationRef,
        action,
        targetUserMessageId: messageId,
      });
      if (action === 'edit_resend') {
        await DesktopConversationContinuityService.editAndResend({
          userId: sessionInfo.userId,
          conversationRef,
          messageId,
          text: queryText,
          payload: sdkReplayPayload,
          model: deferredQueryModelSelection || undefined,
        });
      } else {
        await DesktopConversationContinuityService.retryTurn({
          userId: sessionInfo.userId,
          conversationRef,
          messageId,
          payload: sdkReplayPayload,
          model: deferredQueryModelSelection || undefined,
        });
      }
      logReplayTimeline(chatStore, 'sdk_replay_done', {
        conversationRef,
        action,
        replaySucceeded: true,
        targetUserMessageId: messageId,
      });
    } catch (sdkReplayError) {
      logReplayTimeline(chatStore, 'sdk_replay_failed', {
        conversationRef,
        action,
        replaySucceeded: false,
        errorKind: traceErrorKind(sdkReplayError),
        targetUserMessageId: messageId,
      });
      if (sdkReplayError && typeof sdkReplayError === 'object') {
        sdkReplayError.__desktopRuntimeReplayStep = 'send';
      }
      throw sdkReplayError;
    }
    return true;
  } catch (error) {
    console.error(`[ChatInterface] ${errorPrefix}:`, error);
    logReplayTimeline(chatStore, 'replay_failed_cleanup', {
      conversationRef,
      errorKind: traceErrorKind(error),
      targetUserMessageId: messageId,
    });
    return false;
  }
}

function prepareReplayActionIntent({
  action,
  assistantMessageId,
  editedText,
  userMessageId,
}) {
  if (action === 'edit_resend') {
    return prepareReplayEditIntent({ userMessageId, editedText });
  }
  if (action === 'retry') {
    return prepareReplayRetryIntent({ assistantMessageId });
  }
  return null;
}

function resolveReplayModelSelection({
  config = null,
  deferredQueryModelSelection,
} = {}) {
  return deferredQueryModelSelection
    ?? DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection(config);
}

async function executeReplayAction({
  action,
  activeConversationRef,
  assistantMessageId = null,
  config = null,
  chatStore,
  deferredQueryModelSelection,
  editedText = null,
  sessionInfo = null,
  userMessageId = null,
}) {
  const intent = prepareReplayActionIntent({
    action,
    assistantMessageId,
    editedText,
    userMessageId,
  });
  if (!intent) {
    return undefined;
  }
  const resolvedSessionInfo = sessionInfo
    || DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
  const storeState = chatStore && typeof chatStore.getState === 'function'
    ? chatStore.getState()
    : null;
  const resolvedActiveConversationRef = activeConversationRef ?? storeState?.activeConversationRef ?? null;
  return executeReplayIntent({
    activeConversationRef: resolvedActiveConversationRef,
    chatStore,
    deferredQueryModelSelection: resolveReplayModelSelection({
      config,
      deferredQueryModelSelection,
    }),
    intent,
    sessionInfo: resolvedSessionInfo,
  });
}

export const DesktopConversationReplayRuntime = Object.freeze({
  executeReplayAction,
});
