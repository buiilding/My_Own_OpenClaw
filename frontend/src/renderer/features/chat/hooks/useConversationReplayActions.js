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
  buildReplayMessagesWithPendingTurn,
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
    && imageAttachmentArtifactRef(attachment)
  ));
}

function displayAttachmentsFromRow(row) {
  const attachments = row?.metadata?.attachments;
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return null;
  }
  const normalized = attachments.filter((attachment) => (
    attachment
    && typeof attachment === 'object'
    && !Array.isArray(attachment)
  ));
  return normalized.length > 0 ? normalized : null;
}

function imageAttachmentArtifactRef(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }
  const ref = attachment.screenshotRef
    ?? attachment.screenshot_ref
    ?? attachment.artifactRef
    ?? attachment.artifact_ref
    ?? attachment.id;
  return typeof ref === 'string' && ref.trim() ? ref.trim() : null;
}

function stringArrayMetadataField(metadata, ...keys) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  for (const key of keys) {
    const value = metadata[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const normalized = value
      .filter((entry) => typeof entry === 'string' && entry.trim())
      .map((entry) => entry.trim());
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

function buildReplayAttachmentPayload(row) {
  const payload = {};
  const metadata = row?.metadata;
  const screenshotRefs = stringArrayMetadataField(metadata, 'screenshotRefs', 'screenshot_refs');
  if (screenshotRefs) {
    payload.screenshot_refs = screenshotRefs;
  }
  const screenshotRef = metadata?.screenshotRef
    ?? metadata?.screenshot_ref
    ?? metadata?.screenshot;
  if (!payload.screenshot_refs && typeof screenshotRef === 'string' && screenshotRef.trim()) {
    payload.screenshot_ref = screenshotRef.trim();
  }
  const screenshotUrl = metadata?.screenshotUrl ?? metadata?.screenshot_url;
  if (typeof screenshotUrl === 'string' && screenshotUrl.trim()) {
    payload.screenshot_url = screenshotUrl.trim();
  }

  const attachments = readyImageAttachmentsFromRow(row);
  if (attachments.length === 0) {
    return payload;
  }
  payload.screenshot_refs = attachments
    .map(imageAttachmentArtifactRef)
    .filter(Boolean);
  const attachmentFilenames = attachments
    .map((attachment) => (
      typeof attachment.filename === 'string' && attachment.filename.trim()
        ? attachment.filename.trim()
        : null
    ))
    .filter(Boolean);
  if (attachmentFilenames.length > 0) {
    payload.attachment_filenames = attachmentFilenames;
  }
  return payload;
}

function buildReplayDisplayMetadataPayload(row) {
  const metadata = {};
  const rowMetadata = row?.metadata;
  const attachments = displayAttachmentsFromRow(row);
  if (attachments) {
    metadata.attachments = attachments;
  }
  const screenshotRefs = stringArrayMetadataField(rowMetadata, 'screenshotRefs', 'screenshot_refs')
    ?? (attachments
      ? attachments.map(imageAttachmentArtifactRef).filter(Boolean)
      : null);
  if (screenshotRefs && screenshotRefs.length > 0) {
    metadata.screenshot_refs = screenshotRefs;
  }
  const screenshotRef = rowMetadata?.screenshotRef
    ?? rowMetadata?.screenshot_ref
    ?? rowMetadata?.screenshot;
  if (!metadata.screenshot_refs && typeof screenshotRef === 'string' && screenshotRef.trim()) {
    metadata.screenshot_ref = screenshotRef.trim();
  }
  const screenshotUrl = rowMetadata?.screenshotUrl ?? rowMetadata?.screenshot_url;
  if (typeof screenshotUrl === 'string' && screenshotUrl.trim()) {
    metadata.screenshot_url = screenshotUrl.trim();
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function resolveReplayPendingAttachments(row, fallbackAttachments) {
  return displayAttachmentsFromRow(row) ?? fallbackAttachments ?? null;
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
  pendingAttachments,
  queryText,
  screenshotRef,
  screenshotUrl,
  errorPrefix,
  deferredQueryModelSelection,
  action,
  messageId,
  targetUserMessageId,
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
  let pendingTurnPublished = false;
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
    const replayMetadata = buildReplayDisplayMetadataPayload(rows[userRowIndex]);
    const replayStartedAt = new Date().toISOString();
    const pendingTurn = buildReplayPendingTurn({
      attachments: resolveReplayPendingAttachments(rows[userRowIndex], pendingAttachments),
      conversationRef,
      turnRef: replayTurnRef,
      text: queryText,
      timestamp: replayStartedAt,
    });
    await DesktopConversationContinuityService.replaceRows({
      userId: sessionInfo.userId,
      conversationRef,
      baseRevisionId: displayTimeline.revisionId,
      reason: action === 'edit_resend' ? 'user_edit' : 'retry',
      rows: rows.slice(0, userRowIndex),
    });
    useChatStore.getState().acceptReplayPendingTurn({
      conversationRef,
      messages: buildReplayMessagesWithPendingTurn(replayMessages, pendingTurn),
      pendingTurn,
    });
    DesktopPendingTurnRuntimeClient.setPending(pendingTurn);
    pendingTurnPublished = true;
    try {
      await dispatchPreparedDesktopChatTurn(buildPreparedReplayDesktopChatTurn({
        preparedReplayTurn: {
          conversationRef,
          text: queryText,
          payload: replayPayload,
          metadata: replayMetadata,
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
    if (pendingTurnPublished) {
      useChatStore.getState().setMessages(
        Array.isArray(replayMessages) ? replayMessages : [],
        conversationRef,
      );
    }
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
    const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
    const replayScreenshot = DesktopArtifactRuntimeClient.resolveReplayScreenshotState({
      screenshotRef: editUserMessage.screenshotRef || null,
      screenshotUrl: editUserMessage.screenshotUrl || null,
      screenshotContentType: editUserMessage.screenshotContentType || null,
    });
    return executeReplayAction({
      sessionInfo,
      activeConversationRef,
      replayMessages: replayContextMessages,
      pendingAttachments: editUserMessage.attachments,
      queryText: normalizedEditedText,
      screenshotRef: replayScreenshot.screenshotRef,
      screenshotUrl: replayScreenshot.screenshotUrl,
      errorPrefix: 'Failed to edit user message',
      deferredQueryModelSelection,
      action: 'edit_resend',
      messageId: userMessageId,
      targetUserMessageId: userMessageId,
      addMessage,
    });
  }, [
    activeConversationRef,
    addMessage,
    deferredQueryModelSelection,
    messages,
  ]);

  const handleTryAgainFromAssistant = useCallback(async (assistantMessageId) => {
    const { userIndex } = resolveReplayRetryMessageIndexes(messages, assistantMessageId);
    if (userIndex < 0) {
      return;
    }

    const retryUserMessage = messages[userIndex];
    const preservedMessages = messages.slice(0, userIndex);
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
      errorPrefix: 'Failed to retry assistant message',
      deferredQueryModelSelection,
      action: 'retry',
      messageId: assistantMessageId,
      targetUserMessageId: retryUserMessage.id,
      addMessage,
    });
  }, [
    activeConversationRef,
    addMessage,
    deferredQueryModelSelection,
    messages,
  ]);

  return {
    handleEditFromUser,
    handleTryAgainFromAssistant,
  };
}
