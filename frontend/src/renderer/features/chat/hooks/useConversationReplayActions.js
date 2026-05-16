import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import {
  resolveReplayScreenshotState,
  resolveStoredTranscriptScreenshotValue,
} from '../../../infrastructure/services/screenshotMessageState';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { buildDeferredQueryModelSelection } from '../../../app/providers/appConfigBackendSync';
import { DEFAULT_USER_ID } from '../../dashboard/utils/episodicMemoryUtils';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  updateTranscriptSession,
} from '../../../infrastructure/transcript/TranscriptWriter';
import {
  getConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
} from '../../../infrastructure/workspace/conversationWorkspaceBinding';
import {
  markConversationInferenceSessionLocalOnly,
  rehydrateConversationInferenceSession,
} from '../session/conversationInferenceSessionRuntime';
import { DesktopConversationRuntimeClient } from '../session/desktopConversationRuntimeClient';
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

async function runReplayQueryFlow({
  conversationRef,
  userId,
  transcriptEntries,
  rehydrateEntries,
  queryText,
  screenshotRef,
  screenshotUrl,
  screenshot,
  deferredQueryModelSelection,
  workspacePath,
}) {
  const rehydrateSnapshot = await DesktopConversationRuntimeClient.rewriteTranscriptProjection({
    conversationRef,
    userId: userId || DEFAULT_USER_ID,
    transcriptEntries,
    rehydrateEntries,
  });
  await rehydrateConversationInferenceSession({
    conversationRef,
    messages: rehydrateSnapshot.messages,
  });
  if (deferredQueryModelSelection) {
    DesktopConversationRuntimeClient.setModel(deferredQueryModelSelection);
  }
  await DesktopConversationRuntimeClient.sendQuery({
    text: queryText,
    conversationRef,
    screenshotRef: screenshotRef || null,
    screenshotUrl: screenshotUrl || null,
    screenshotRefs: null,
    captureMeta: null,
    attachmentContext: null,
    attachmentFilenames: null,
    screenshot: screenshot || null,
    workspacePath: workspacePath || null,
  });
}

function ensureConversationRef(sessionConversationRef, storeConversationRef) {
  let conversationRef = resolveRendererConversationSessionSnapshot({
    transcriptConversationRef: getActiveConversationRef() || sessionConversationRef,
    storeConversationRef,
  }).conversationRef;
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
  activeConversationRef,
  replayMessages,
  preservedMessages,
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
}) {
  const conversationRef = ensureConversationRef(
    sessionInfo.conversationRef,
    activeConversationRef,
  );
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
      transcriptEntries: buildTranscriptProjectionEntries(replayMessages),
      rehydrateEntries: buildTranscriptProjectionEntries(preservedMessages),
      queryText,
      screenshotRef: screenshotRef || null,
      screenshotUrl: screenshotUrl || null,
      screenshot: screenshot || null,
      deferredQueryModelSelection,
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
    const sessionInfo = getTranscriptSessionInfo();
    const replayScreenshot = resolveReplayScreenshotState({
      screenshot: editUserMessage.screenshot || null,
      screenshotRef: editUserMessage.screenshotRef || null,
      screenshotUrl: editUserMessage.screenshotUrl || null,
      screenshotContentType: editUserMessage.screenshotContentType || null,
    });
    await executeReplayAction({
      sessionInfo,
      activeConversationRef,
      replayMessages: replayConversation,
      preservedMessages: replayContextMessages,
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
    const sessionInfo = getTranscriptSessionInfo();
    const replayScreenshot = resolveReplayScreenshotState({
      screenshot: retryUserMessage.screenshot || null,
      screenshotRef: retryUserMessage.screenshotRef || null,
      screenshotUrl: retryUserMessage.screenshotUrl || null,
      screenshotContentType: retryUserMessage.screenshotContentType || null,
    });
    await executeReplayAction({
      sessionInfo,
      activeConversationRef,
      replayMessages: replayContextMessages,
      preservedMessages: replayContextMessages.slice(0, -1),
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
