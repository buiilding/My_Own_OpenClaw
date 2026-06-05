import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import {
  resolveReplayScreenshotState,
} from '../../../infrastructure/services/screenshotMessageState';
import { useAppConfigContext } from '../../../app/providers/AppConfigContext';
import { buildDeferredQueryModelSelection } from '../../../app/providers/appConfigBackendSync';
import {
  getConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
} from '../../../infrastructure/workspace/conversationWorkspaceBinding';
import {
  markConversationInferenceSessionLocalOnly,
} from '../session/conversationInferenceSessionRuntime';
import { DesktopConversationContinuityService } from '../../../app/runtime/desktopConversationContinuityService';
import { DesktopTranscriptSessionRuntimeClient } from '../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import {
  applyRendererConversationSelection,
  initializeLocalConversationSession,
  resolveRendererConversationSessionSnapshot,
} from '../session/conversationSessionRuntime';
import { createConversationRef } from '../utils/session/conversationRef';
import { buildReplayContextMessages } from '../utils/conversationReplayToolMessages';
import { dispatchPreparedDesktopChatTurn } from '../utils/messageSender/desktopChatSendPreparation';

const REPLAY_PREPARATION_FAILURE_MESSAGE = 'Your message was not resent because WindieOS could not prepare the conversation replay. Try reopening the chat and sending again.';
const REPLAY_SEND_FAILURE_MESSAGE = "Your message wasn't sent because WindieOS isn't connected right now. Try again when the backend reconnects.";

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
        setConversationWorkspaceBinding(nextConversationRef, null);
      },
      markConversationInferenceSessionLocalOnly,
    });
  }
  return conversationRef;
}

function buildPreparedReplayDesktopChatTurn({
  preparedReplayTurn,
  conversationRef,
  deferredQueryModelSelection,
  screenshotRef,
  screenshotUrl,
  screenshot,
  sessionInfo,
  workspacePath,
}) {
  const replayTurnRef = preparedReplayTurn.turnRef || crypto.randomUUID();
  return {
    attachmentContext: null,
    attachmentFilenames: null,
    captureMeta: null,
    conversationRef: preparedReplayTurn.conversationRef || conversationRef,
    deferredQueryModelSelection: null,
    model: preparedReplayTurn.model ?? deferredQueryModelSelection ?? null,
    screenshot: preparedReplayTurn.payload?.screenshot ?? screenshot ?? null,
    screenshotRef: preparedReplayTurn.payload?.screenshot_ref ?? screenshotRef ?? null,
    screenshotRefs: preparedReplayTurn.payload?.screenshot_refs ?? null,
    screenshotUrl: preparedReplayTurn.payload?.screenshot_url ?? screenshotUrl ?? null,
    sendLifecycle: {
      shouldCaptureQueryScreenshot: false,
      shouldReturnToChatboxOnSend: false,
      surfaceReason: 'replay',
    },
    sessionInfo,
    text: preparedReplayTurn.text,
    timestamp: new Date().toISOString(),
    turnId: replayTurnRef,
    turnRef: replayTurnRef,
    workspacePath: preparedReplayTurn.workspacePath ?? workspacePath ?? null,
  };
}

function userMessageOrdinalAt(messages, targetIndex) {
  if (!Array.isArray(messages) || targetIndex < 0) {
    return null;
  }
  let ordinal = -1;
  for (let index = 0; index <= targetIndex; index += 1) {
    if (messages[index]?.sender === 'user') {
      ordinal += 1;
    }
  }
  return ordinal >= 0 ? ordinal : null;
}

async function executeReplayAction({
  sessionInfo,
  activeConversationRef,
  sourceMessages,
  replayMessages,
  queryText,
  screenshotRef,
  screenshotUrl,
  screenshot,
  setMessages,
  setThinkingStatus,
  setThinkingSourceEventType,
  setIsSending,
  errorPrefix,
  deferredQueryModelSelection,
  action,
  messageId,
  userMessageOrdinal,
  addMessage,
}) {
  const conversationRef = ensureConversationRef(
    sessionInfo.conversationRef,
    activeConversationRef,
  );
  const workspaceBinding = getConversationWorkspaceBinding(conversationRef);
  applyRendererConversationSelection({
    conversationRef,
    userId: sessionInfo.userId || undefined,
    updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
  });

  setMessages(replayMessages, conversationRef);
  setThinkingStatus(null, conversationRef);
  if (typeof setThinkingSourceEventType === 'function') {
    setThinkingSourceEventType(null, conversationRef);
  }
  setIsSending(true, conversationRef);

  try {
    const rewritePayload = {
      conversationRef,
      userId: sessionInfo.userId,
      messageId,
      userMessageOrdinal,
      text: queryText,
      payload: {
        screenshot_ref: screenshotRef || null,
        screenshot_url: screenshotUrl || null,
        screenshot_refs: null,
        screenshot: screenshot || null,
      },
      model: deferredQueryModelSelection || null,
      workspacePath: workspaceBinding.workspacePath || null,
    };
    const preparedReplayTurn = action === 'edit_resend'
      ? await DesktopConversationContinuityService.prepareEditAndResend(rewritePayload)
      : await DesktopConversationContinuityService.prepareRetryTurn(rewritePayload);
    try {
      await dispatchPreparedDesktopChatTurn(buildPreparedReplayDesktopChatTurn({
        preparedReplayTurn,
        conversationRef,
        deferredQueryModelSelection,
        screenshotRef,
        screenshotUrl,
        screenshot,
        sessionInfo,
        workspacePath: workspaceBinding.workspacePath ?? null,
      }));
    } catch (sendError) {
      if (sendError && typeof sendError === 'object') {
        sendError.__windieReplayStep = 'send';
      }
      throw sendError;
    }
    return true;
  } catch (error) {
    console.error(`[ChatInterface] ${errorPrefix}:`, error);
    setMessages(sourceMessages, conversationRef);
    setIsSending(false, conversationRef);
    if (typeof addMessage === 'function') {
      const replayStep = error?.__windieReplayStep === 'send' ? 'send' : 'prepare';
      addMessage({
        id: crypto.randomUUID(),
        text: replayStep === 'send' ? REPLAY_SEND_FAILURE_MESSAGE : REPLAY_PREPARATION_FAILURE_MESSAGE,
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

export function useConversationReplayActions({
  messages,
  setMessages,
  setThinkingStatus,
  setThinkingSourceEventType,
  setIsSending,
}) {
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);
  const addMessage = useChatStore((state) => state.addMessage);
  const { config } = useAppConfigContext();
  const deferredQueryModelSelection = buildDeferredQueryModelSelection(config);

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    const normalizedEditedText = typeof editedText === 'string'
      ? editedText.trim()
      : '';
    if (!normalizedEditedText) {
      return;
    }

    const userIndex = messages.findIndex(
      (message) => message.id === userMessageId && message.sender === 'user',
    );
    if (userIndex < 0) {
      return;
    }

    const editUserMessage = {
      ...messages[userIndex],
      text: normalizedEditedText,
    };
    const preservedMessages = messages.slice(0, userIndex);
    const replayContextMessages = buildReplayContextMessages(preservedMessages);
    const replayConversation = [...replayContextMessages, editUserMessage];
    const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
    const replayScreenshot = resolveReplayScreenshotState({
      screenshot: editUserMessage.screenshot || null,
      screenshotRef: editUserMessage.screenshotRef || null,
      screenshotUrl: editUserMessage.screenshotUrl || null,
      screenshotContentType: editUserMessage.screenshotContentType || null,
    });
    return executeReplayAction({
      sessionInfo,
      activeConversationRef,
      sourceMessages: messages,
      replayMessages: replayConversation,
      queryText: normalizedEditedText,
      screenshotRef: replayScreenshot.screenshotRef,
      screenshotUrl: replayScreenshot.screenshotUrl,
      screenshot: replayScreenshot.screenshot,
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
      setIsSending,
      errorPrefix: 'Failed to edit user message',
      deferredQueryModelSelection,
      action: 'edit_resend',
      messageId: userMessageId,
      userMessageOrdinal: userMessageOrdinalAt(messages, userIndex),
      addMessage,
    });
  }, [
    activeConversationRef,
    addMessage,
    deferredQueryModelSelection,
    messages,
    setIsSending,
    setMessages,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    const assistantIndex = messages.findIndex(
      (message) => message.id === assistantMessageId && message.sender === 'assistant',
    );
    if (assistantIndex < 0) {
      return;
    }

    let userIndex = -1;
    for (let index = assistantIndex; index >= 0; index -= 1) {
      if (messages[index]?.sender === 'user') {
        userIndex = index;
        break;
      }
    }
    if (userIndex < 0) {
      return;
    }

    const retryUserMessage = messages[userIndex];
    const preservedMessages = messages.slice(0, userIndex + 1);
    const replayContextMessages = buildReplayContextMessages(preservedMessages);
    const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
    const replayScreenshot = resolveReplayScreenshotState({
      screenshot: retryUserMessage.screenshot || null,
      screenshotRef: retryUserMessage.screenshotRef || null,
      screenshotUrl: retryUserMessage.screenshotUrl || null,
      screenshotContentType: retryUserMessage.screenshotContentType || null,
    });
    return executeReplayAction({
      sessionInfo,
      activeConversationRef,
      sourceMessages: messages,
      replayMessages: replayContextMessages,
      queryText: retryUserMessage.text,
      screenshotRef: replayScreenshot.screenshotRef,
      screenshotUrl: replayScreenshot.screenshotUrl,
      screenshot: replayScreenshot.screenshot,
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
      setIsSending,
      errorPrefix: 'Failed to retry assistant message',
      deferredQueryModelSelection,
      action: 'retry',
      messageId: assistantMessageId,
      userMessageOrdinal: userMessageOrdinalAt(messages, userIndex),
      addMessage,
    });
  }, [
    activeConversationRef,
    addMessage,
    deferredQueryModelSelection,
    messages,
    setIsSending,
    setMessages,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
