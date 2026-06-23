/**
 * Provides the use conversation replay actions module for the renderer UI.
 */

import { useCallback } from 'react';
import { DesktopRuntimeSkin } from '../../../app/skin/desktopRuntimeSkin';
import { useChatStore } from '../stores/chatStore';
import {
  DesktopRendererConfigRuntimeClient,
} from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopArtifactRuntimeClient } from '../../../app/runtime/desktopArtifactRuntimeClient';
import { DesktopConversationContinuityService } from '../../../app/runtime/desktopConversationContinuityService';
import { DesktopTranscriptSessionRuntimeClient } from '../../../app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from '../../../app/runtime/desktopWorkspaceRuntimeClient';
import {
  DesktopConversationSessionRuntime,
} from '../../../app/runtime/desktopConversationSessionRuntime';
import {
  DesktopConversationReplayRuntime,
} from '../../../app/runtime/desktopConversationReplayRuntime';
import { DesktopChatSendPreparationRuntime } from '../../../app/runtime/desktopChatSendPreparationRuntime';
import { DesktopPendingTurnRuntimeClient } from '../../../app/runtime/desktopPendingTurnRuntimeClient';

const chatSkin = DesktopRuntimeSkin.desktopRuntimeSkin.chat;
const {
  buildPreparedReplayDesktopChatTurn,
  buildReplayPendingTurn,
  buildReplayContextMessages,
  buildReplayPreparationPayload,
  findReplayEditableUserMessageIndex,
  resolveReplayRetryMessageIndexes,
} = DesktopConversationReplayRuntime;
const {
  dispatchPreparedDesktopChatTurn,
} = DesktopChatSendPreparationRuntime;
const {
  applyRendererConversationSelection,
  createConversationRef,
  initializeLocalConversationSession,
  resolveRendererConversationSessionSnapshot,
} = DesktopConversationSessionRuntime;

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

function readyImageAttachmentsFromRow(row) {
  const attachments = row?.metadata?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }
  return attachments.filter((attachment) => (
    attachment
    && typeof attachment === 'object'
    && attachment.kind === 'image'
    && attachment.status === 'ready'
    && typeof attachment.id === 'string'
    && attachment.id.trim()
  ));
}

function buildReplayAttachmentPayload(row) {
  const attachments = readyImageAttachmentsFromRow(row);
  if (attachments.length === 0) {
    return {};
  }
  return {
    screenshot_refs: attachments.map((attachment) => attachment.id.trim()),
    attachment_filenames: attachments
      .map((attachment) => (
        typeof attachment.filename === 'string' && attachment.filename.trim()
          ? attachment.filename.trim()
          : null
      ))
      .filter(Boolean),
  };
}

function findTimelineRowIndex(rows, messageId, predicate = () => true) {
  if (!Array.isArray(rows) || typeof messageId !== 'string' || !messageId) {
    return -1;
  }
  return rows.findIndex((row) => row?.id === messageId && predicate(row));
}

function findTimelineRetryUserIndex(rows, assistantMessageId) {
  const assistantIndex = findTimelineRowIndex(
    rows,
    assistantMessageId,
    (row) => row.role === 'assistant' || row.type === 'assistant_message',
  );
  if (assistantIndex < 0) {
    return -1;
  }
  for (let index = assistantIndex; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.role === 'user' && row?.type === 'user_message') {
      return index;
    }
  }
  return -1;
}

async function executeReplayAction({
  sessionInfo,
  activeConversationRef,
  replayMessages,
  queryText,
  screenshotRef,
  screenshotUrl,
  setMessages,
  setThinkingStatus,
  setThinkingSourceEventType,
  errorPrefix,
  deferredQueryModelSelection,
  action,
  messageId,
  targetUserMessageId,
  pendingUserMessageId,
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
  const replayTurnRef = crypto.randomUUID();
  const replayStartedAt = new Date().toISOString();
  const pendingTurn = buildReplayPendingTurn({
    conversationRef,
    turnRef: replayTurnRef,
    userMessageId: pendingUserMessageId,
    text: queryText,
    timestamp: replayStartedAt,
  });
  try {
    const displayTimeline = await DesktopConversationContinuityService.loadDisplayTimeline(
      sessionInfo.userId,
      conversationRef,
    );
    const rows = Array.isArray(displayTimeline?.rows) ? displayTimeline.rows : [];
    const userRowIndex = action === 'edit_resend'
      ? findTimelineRowIndex(
        rows,
        targetUserMessageId,
        (row) => row.role === 'user' && row.type === 'user_message',
      )
      : findTimelineRetryUserIndex(rows, messageId);
    if (userRowIndex < 0) {
      throw new Error(`Cannot ${action === 'edit_resend' ? 'edit' : 'retry'} missing display user row`);
    }
    const replayPayload = {
      ...buildReplayAttachmentPayload(rows[userRowIndex]),
      ...buildReplayPreparationPayload({ screenshotRef, screenshotUrl }),
    };
    await DesktopConversationContinuityService.replaceRows({
      userId: sessionInfo.userId,
      conversationRef,
      baseRevisionId: displayTimeline.revisionId,
      reason: action === 'edit_resend' ? 'user_edit' : 'retry',
      rows: rows.slice(0, userRowIndex),
    });
    setMessages(replayMessages, conversationRef);
    setThinkingStatus(null, conversationRef);
    if (typeof setThinkingSourceEventType === 'function') {
      setThinkingSourceEventType(null, conversationRef);
    }
    useChatStore.getState().acceptPendingTurn(pendingTurn);
    DesktopPendingTurnRuntimeClient.setPending(pendingTurn);
    try {
      await dispatchPreparedDesktopChatTurn(buildPreparedReplayDesktopChatTurn({
        preparedReplayTurn: {
          conversationRef,
          text: queryText,
          payload: replayPayload,
          model: deferredQueryModelSelection || null,
          workspacePath: workspaceBinding.workspacePath || null,
          turnRef: replayTurnRef,
        },
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
    useChatStore.getState().clearPendingTurn({
      conversationRef,
      turnRef: replayTurnRef,
    });
    DesktopPendingTurnRuntimeClient.clear({
      conversationRef,
      turnRef: replayTurnRef,
    });
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
}) {
  const activeConversationRef = useChatStore((state) => state.activeConversationRef);
  const addMessage = useChatStore((state) => state.addMessage);
  const { config } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const deferredQueryModelSelection = DesktopRendererConfigRuntimeClient
    .buildDeferredQueryModelSelection(config);

  const handleEditFromUser = useCallback(async (userMessageId, editedText) => {
    const normalizedEditedText = typeof editedText === 'string'
      ? editedText.trim()
      : '';
    if (!normalizedEditedText) {
      return;
    }

    const userIndex = findReplayEditableUserMessageIndex(messages, userMessageId);
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
      replayMessages: replayConversation,
      queryText: normalizedEditedText,
      screenshotRef: replayScreenshot.screenshotRef,
      screenshotUrl: replayScreenshot.screenshotUrl,
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
      errorPrefix: 'Failed to edit user message',
      deferredQueryModelSelection,
      action: 'edit_resend',
      messageId: userMessageId,
      targetUserMessageId: userMessageId,
      pendingUserMessageId: editUserMessage.id,
      addMessage,
    });
  }, [
    activeConversationRef,
    addMessage,
    deferredQueryModelSelection,
    messages,
    setMessages,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    const { userIndex } = resolveReplayRetryMessageIndexes(messages, assistantMessageId);
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
      replayMessages: replayContextMessages,
      queryText: retryUserMessage.text,
      screenshotRef: replayScreenshot.screenshotRef,
      screenshotUrl: replayScreenshot.screenshotUrl,
      setMessages,
      setThinkingStatus,
      setThinkingSourceEventType,
      errorPrefix: 'Failed to retry assistant message',
      deferredQueryModelSelection,
      action: 'retry',
      messageId: assistantMessageId,
      targetUserMessageId: retryUserMessage.id,
      pendingUserMessageId: retryUserMessage.id,
      addMessage,
    });
  }, [
    activeConversationRef,
    addMessage,
    deferredQueryModelSelection,
    messages,
    setMessages,
    setThinkingSourceEventType,
    setThinkingStatus,
  ]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
