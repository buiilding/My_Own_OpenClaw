import { useCallback } from 'react';
import { ApiClient } from '../../../infrastructure/api/client';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  resolveReplayScreenshotState,
  resolveStoredTranscriptScreenshotValue,
} from '../../../infrastructure/services/screenshotMessageState';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { buildDeferredQueryModelConfig } from '../../../app/providers/appConfigBackendSync';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import { deleteConversationStoredState } from '../../../infrastructure/transcript/conversationReplayState';
import {
  getConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
} from '../../../infrastructure/workspace/conversationWorkspaceBinding';
import {
  markConversationInferenceSessionLocalOnly,
  rehydrateConversationInferenceSession,
} from '../session/conversationInferenceSessionRuntime';
import {
  applyRendererConversationSelection,
  initializeLocalConversationSession,
} from '../session/conversationSessionRuntime';
import { createConversationRef } from '../utils/session/conversationRef';
import {
  resolveTranscriptMessageType,
  resolveTranscriptRole,
  toRehydratePayload,
} from '../utils/session/transcriptMessagePayload';
import { buildReplayContextMessages } from '../utils/conversationReplayToolMessages';

async function replayTranscriptMessages(messages, userId, conversationRef) {
  if (!userId) {
    return;
  }

  const workspaceBinding = getConversationWorkspaceBinding(conversationRef);

  await deleteConversationStoredState({
    userId,
    conversationRef,
    workspacePath: workspaceBinding.workspacePath || null,
    workspaceName: workspaceBinding.workspaceName || null,
  });

  for (const message of messages) {
    const storedScreenshot = resolveStoredTranscriptScreenshotValue({
      screenshot: message.screenshot || null,
      screenshotRef: message.screenshotRef || null,
      screenshotUrl: message.screenshotUrl || null,
      screenshotContentType: message.screenshotContentType || null,
    });
    await IpcBridge.invoke(INVOKE_CHANNELS.STORE_TRANSCRIPT, {
      content: message.text,
      userId,
      conversationRef,
      role: resolveTranscriptRole(message),
      messageType: resolveTranscriptMessageType(message),
      toolName: message.toolName || null,
      correlationId: message.correlationId || null,
      screenshot: storedScreenshot,
      timestamp: message.timestamp || null,
      workspacePath: workspaceBinding.workspacePath || null,
      workspaceName: workspaceBinding.workspaceName || null,
    });
  }
}

async function runReplayQueryFlow({
  conversationRef,
  userId,
  transcriptMessages,
  rehydratePayloads,
  queryText,
  screenshotRef,
  screenshotUrl,
  screenshot,
  deferredQueryModelConfig,
  workspacePath,
}) {
  await replayTranscriptMessages(transcriptMessages, userId, conversationRef);
  await rehydrateConversationInferenceSession({
    conversationRef,
    messages: rehydratePayloads,
  });
  if (deferredQueryModelConfig) {
    ApiClient.updateSettings(deferredQueryModelConfig);
  }
  await ApiClient.sendQuery(
    queryText,
    conversationRef,
    screenshotRef || null,
    screenshotUrl || null,
    null,
    null,
    null,
    null,
    screenshot || null,
    workspacePath || null,
  );
}

function ensureConversationRef(sessionConversationRef) {
  let conversationRef = getActiveConversationRef() || sessionConversationRef;
  if (!conversationRef) {
    conversationRef = initializeLocalConversationSession({
      createConversationRef,
      selectConversationRef: (nextConversationRef) => {
        applyRendererConversationSelection({
          conversationRef: nextConversationRef,
          updateTranscriptSession,
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
  replayMessages,
  preservedPayloads,
  queryText,
  screenshotRef,
  screenshotUrl,
  screenshot,
  setMessages,
  setThinkingStatus,
  setThinkingSourceEventType,
  setIsSending,
  errorPrefix,
  deferredQueryModelConfig,
}) {
  const conversationRef = ensureConversationRef(sessionInfo.conversationRef);
  const workspaceBinding = getConversationWorkspaceBinding(conversationRef);
  applyRendererConversationSelection({
    conversationRef,
    userId: sessionInfo.userId || undefined,
    updateTranscriptSession,
  });

  setMessages(replayMessages, conversationRef);
  setThinkingStatus(null, conversationRef);
  if (typeof setThinkingSourceEventType === 'function') {
    setThinkingSourceEventType(null, conversationRef);
  }
  setIsSending(true, conversationRef);

  try {
    // Replay always rewrites transcript first, then rehydrates, then sends query.
    // This preserves the same history reconstruction contract for edit + try-again.
    await runReplayQueryFlow({
      conversationRef,
      userId: sessionInfo.userId,
      transcriptMessages: replayMessages,
      rehydratePayloads: preservedPayloads,
      queryText,
      screenshotRef: screenshotRef || null,
      screenshotUrl: screenshotUrl || null,
      screenshot: screenshot || null,
      deferredQueryModelConfig,
      workspacePath: workspaceBinding.workspacePath || null,
    });
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
  const { config } = useAppConfigContext();
  const deferredQueryModelConfig = buildDeferredQueryModelConfig(config);

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
    const preservedPayloads = replayContextMessages.map(toRehydratePayload).filter(Boolean);
    const sessionInfo = getTranscriptSessionInfo();
    const replayScreenshot = resolveReplayScreenshotState({
      screenshot: editUserMessage.screenshot || null,
      screenshotRef: editUserMessage.screenshotRef || null,
      screenshotUrl: editUserMessage.screenshotUrl || null,
      screenshotContentType: editUserMessage.screenshotContentType || null,
    });
    await executeReplayAction({
      sessionInfo,
      replayMessages: replayConversation,
      preservedPayloads,
      queryText: normalizedEditedText,
      screenshotRef: replayScreenshot.screenshotRef,
      screenshotUrl: replayScreenshot.screenshotUrl,
      screenshot: replayScreenshot.screenshot,
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
      setIsSending,
      errorPrefix: 'Failed to edit user message',
      deferredQueryModelConfig,
    });
  }, [deferredQueryModelConfig, messages, setIsSending, setMessages, setThinkingSourceEventType, setThinkingStatus]);

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
    const preservedPayloads = replayContextMessages
      .slice(0, -1)
      .map(toRehydratePayload)
      .filter(Boolean);
    const sessionInfo = getTranscriptSessionInfo();
    const replayScreenshot = resolveReplayScreenshotState({
      screenshot: retryUserMessage.screenshot || null,
      screenshotRef: retryUserMessage.screenshotRef || null,
      screenshotUrl: retryUserMessage.screenshotUrl || null,
      screenshotContentType: retryUserMessage.screenshotContentType || null,
    });
    await executeReplayAction({
      sessionInfo,
      replayMessages: replayContextMessages,
      preservedPayloads,
      queryText: retryUserMessage.text,
      screenshotRef: replayScreenshot.screenshotRef,
      screenshotUrl: replayScreenshot.screenshotUrl,
      screenshot: replayScreenshot.screenshot,
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
      setIsSending,
      errorPrefix: 'Failed to retry assistant message',
      deferredQueryModelConfig,
    });
  }, [deferredQueryModelConfig, messages, setIsSending, setMessages, setThinkingSourceEventType, setThinkingStatus]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
