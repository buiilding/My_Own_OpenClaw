import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import {
  resolveReplayScreenshotState,
  resolveStoredTranscriptScreenshotValue,
} from '../../../infrastructure/services/screenshotMessageState';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { buildDeferredQueryModelSelection } from '../../../app/providers/appConfigBackendSync';
import {
  getConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
} from '../../../infrastructure/workspace/conversationWorkspaceBinding';
import {
  markConversationInferenceSessionLocalOnly,
} from '../session/conversationInferenceSessionRuntime';
import { DesktopConversationRuntimeClient } from '../session/desktopConversationRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import {
  applyRendererConversationSelection,
  initializeLocalConversationSession,
  resolveRendererConversationSessionSnapshot,
} from '../session/conversationSessionRuntime';
import { createConversationRef } from '../utils/session/conversationRef';
import {
  resolveTranscriptMessageType,
  resolveTranscriptRole,
} from '../utils/session/transcriptMessagePayload';
import { buildReplayContextMessages } from '../utils/conversationReplayToolMessages';

function buildTranscriptProjectionEntries(messages) {
  return messages.map((message) => ({
    messageId: message.id,
    content: message.text,
    role: resolveTranscriptRole(message),
    messageType: resolveTranscriptMessageType(message),
    toolName: message.toolName || null,
    correlationId: message.correlationId || null,
    screenshot: resolveStoredTranscriptScreenshotValue({
      screenshot: message.screenshot || null,
      screenshotRef: message.screenshotRef || null,
      screenshotUrl: message.screenshotUrl || null,
      screenshotContentType: message.screenshotContentType || null,
    }),
    timestamp: message.timestamp || null,
  }));
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
        setConversationWorkspaceBinding(nextConversationRef, null);
      },
      markConversationInferenceSessionLocalOnly,
    });
  }
  return conversationRef;
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
      text: queryText,
      projectionEntries: buildTranscriptProjectionEntries(sourceMessages),
      payload: {
        screenshot_ref: screenshotRef || null,
        screenshot_url: screenshotUrl || null,
        screenshot_refs: null,
        screenshot: screenshot || null,
      },
      model: deferredQueryModelSelection || null,
      workspacePath: workspaceBinding.workspacePath || null,
    };
    if (action === 'edit_resend') {
      await DesktopConversationRuntimeClient.editAndResend(rewritePayload);
    } else {
      await DesktopConversationRuntimeClient.retryTurn(rewritePayload);
    }
  } catch (error) {
    console.error(`[ChatInterface] ${errorPrefix}:`, error);
    setIsSending(false, conversationRef);
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
    await executeReplayAction({
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
    });
  }, [
    activeConversationRef,
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
    await executeReplayAction({
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
    });
  }, [
    activeConversationRef,
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
