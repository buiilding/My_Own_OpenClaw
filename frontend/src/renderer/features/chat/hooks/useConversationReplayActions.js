/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback } from 'react';
import { desktopRuntimeSkin } from '../../../app/skin/desktopRuntimeSkin';
import { useChatStore } from '../stores/chatStore';
import { useAppConfigContext } from '../../../app/providers/AppConfigContext';
import { buildDeferredQueryModelSelection } from '../../../app/providers/appConfigRuntimeSync';
import { DesktopArtifactRuntimeClient } from '../../../app/runtime/desktopArtifactRuntimeClient';
import { DesktopConversationContinuityService } from '../../../app/runtime/desktopConversationContinuityService';
import { DesktopTranscriptSessionRuntimeClient } from '../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from '../../../app/runtime/desktopWorkspaceRuntimeClient';
import {
  applyRendererConversationSelection,
  initializeLocalConversationSession,
  resolveRendererConversationSessionSnapshot,
} from '../session/conversationSessionRuntime';
import { createConversationRef } from '../utils/session/conversationRef';
import { buildReplayContextMessages } from '../utils/conversationReplayToolMessages';
import { dispatchPreparedDesktopChatTurn } from '../utils/messageSender/desktopChatSendPreparation';

const chatSkin = desktopRuntimeSkin.chat;

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

function stringArrayPayloadField(payload, ...keys) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  for (const key of keys) {
    const value = payload[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const normalized = value
      .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim());
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

function buildReplayPayload({
  screenshotRef,
  screenshotUrl,
}) {
  const payload = {};
  if (screenshotRef) {
    payload.screenshot_ref = screenshotRef;
  }
  if (screenshotUrl) {
    payload.screenshot_url = screenshotUrl;
  }
  return payload;
}

function buildPreparedReplayDesktopChatTurn({
  preparedReplayTurn,
  conversationRef,
  deferredQueryModelSelection,
  screenshotRef,
  screenshotUrl,
  sessionInfo,
  workspacePath,
}) {
  const replayTurnRef = preparedReplayTurn.turnRef || crypto.randomUUID();
  return {
    attachmentFilenames: stringArrayPayloadField(
      preparedReplayTurn.payload,
      'attachment_filenames',
      'attachmentFilenames',
    ),
    conversationRef: preparedReplayTurn.conversationRef || conversationRef,
    deferredQueryModelSelection: null,
    metadata: null,
    model: preparedReplayTurn.model ?? deferredQueryModelSelection ?? null,
    resources: [],
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

async function executeReplayAction({
  sessionInfo,
  activeConversationRef,
  sourceMessages,
  replayMessages,
  queryText,
  screenshotRef,
  screenshotUrl,
  setMessages,
  setThinkingStatus,
  setThinkingSourceEventType,
  setIsSending,
  errorPrefix,
  deferredQueryModelSelection,
  action,
  messageId,
  addMessage,
}) {
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
      payload: buildReplayPayload({ screenshotRef, screenshotUrl }),
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
        sessionInfo,
        workspacePath: workspaceBinding.workspacePath ?? null,
      }));
    } catch (sendError) {
      if (sendError && typeof sendError === 'object') {
        sendError.__desktopRuntimeReplayStep = 'send';
      }
      throw sendError;
    }
    return true;
  } catch (error) {
    console.error(`[ChatInterface] ${errorPrefix}:`, error);
    setMessages(sourceMessages, conversationRef);
    setIsSending(false, conversationRef);
    if (typeof addMessage === 'function') {
      const replayStep = error?.__desktopRuntimeReplayStep === 'send' ? 'send' : 'prepare';
      addMessage({
        id: crypto.randomUUID(),
        text: replayStep === 'send'
          ? chatSkin.sendFailureMessage
          : chatSkin.replayPreparationFailureMessage,
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
    const replayScreenshot = DesktopArtifactRuntimeClient.resolveReplayScreenshotState({
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
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
      setIsSending,
      errorPrefix: 'Failed to edit user message',
      deferredQueryModelSelection,
      action: 'edit_resend',
      messageId: userMessageId,
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
    const replayScreenshot = DesktopArtifactRuntimeClient.resolveReplayScreenshotState({
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
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
      setIsSending,
      errorPrefix: 'Failed to retry assistant message',
      deferredQueryModelSelection,
      action: 'retry',
      messageId: assistantMessageId,
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
