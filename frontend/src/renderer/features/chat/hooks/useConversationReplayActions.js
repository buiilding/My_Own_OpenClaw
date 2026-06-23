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
import { DesktopLiveTurnRuntimeClient } from '../../../app/runtime/desktopLiveTurnRuntimeClient';
import { DesktopRendererTraceRuntime } from '../../../app/runtime/desktopRendererTraceRuntime';

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
  logRendererReplayTrace,
} = DesktopRendererTraceRuntime;
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

function buildReplayReplacementUserRow({
  attachments,
  baseRevisionId,
  content,
  replacedRowId,
  pendingTurn,
  sourceRow,
  timestamp,
}) {
  return {
    ...sourceRow,
    id: pendingTurn.userMessageId,
    conversationRef: pendingTurn.conversationRef,
    revisionId: baseRevisionId,
    index: 0,
    role: 'user',
    type: 'user_message',
    turnRef: pendingTurn.turnRef,
    content,
    metadata: {
      ...(sourceRow?.metadata ?? {}),
      eventId: pendingTurn.userMessageId,
      replacedDisplayRowId: replacedRowId,
      revisionId: baseRevisionId,
      source: 'ui',
      sourceEventType: 'renderer-compose',
      timestamp,
      ...(Array.isArray(attachments) && attachments.length > 0
        ? { attachments }
        : {}),
    },
  };
}

function buildReplaySourceUserRowFromMessage({
  baseRevisionId,
  conversationRef,
  message,
}) {
  if (!message || message.sender !== 'user' || typeof message.id !== 'string') {
    return null;
  }
  const attachments = Array.isArray(message.attachments) && message.attachments.length > 0
    ? message.attachments
    : null;
  return {
    id: message.id,
    conversationRef,
    revisionId: baseRevisionId,
    index: 0,
    role: 'user',
    type: 'user_message',
    turnRef: typeof message.turnRef === 'string' && message.turnRef.trim()
      ? message.turnRef.trim()
      : null,
    content: typeof message.text === 'string' ? message.text : '',
    metadata: {
      eventId: message.id,
      revisionId: baseRevisionId,
      source: 'ui',
      sourceEventType: message.sourceEventType ?? 'renderer-compose',
      timestamp: typeof message.timestamp === 'string' ? message.timestamp : null,
      ...(attachments ? { attachments } : {}),
    },
  };
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

function replayTraceSnapshot(conversationRef, newTurnRef = null, oldTurnRef = null) {
  const state = useChatStore.getState();
  const workspace = state.getWorkspaceState(conversationRef);
  const currentTurnProjection = workspace.currentTurnProjection ?? null;
  const latestCurrentTurnProjection = state.latestCurrentTurnProjection ?? null;
  const pendingTurn = workspace.pendingTurn ?? null;
  return {
    pendingTurnRef: pendingTurn?.turnRef ?? null,
    currentTurnRef: currentTurnProjection?.turnRef ?? null,
    currentTurnPhase: currentTurnProjection?.phase ?? null,
    latestCurrentTurnRef: latestCurrentTurnProjection?.turnRef ?? null,
    latestCurrentTurnPhase: latestCurrentTurnProjection?.phase ?? null,
    streamActiveTurnRef: workspace.streamTracking?.activeTurnRef ?? null,
    streamPhase: workspace.streamTracking?.phase ?? null,
    messageCount: Array.isArray(workspace.messages) ? workspace.messages.length : 0,
    pendingPresent: Boolean(pendingTurn),
    pendingMatchesNewTurn: Boolean(newTurnRef && pendingTurn?.turnRef === newTurnRef),
    currentMatchesNewTurn: Boolean(newTurnRef && currentTurnProjection?.turnRef === newTurnRef),
    currentMatchesOldTurn: Boolean(oldTurnRef && currentTurnProjection?.turnRef === oldTurnRef),
  };
}

function logReplayTimeline(action, {
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
    ...replayTraceSnapshot(conversationRef, newTurnRef, oldTurnRef),
    ...values,
  });
}

function timelineRowMatchesMessageId(row, messageId) {
  if (!row || typeof messageId !== 'string' || !messageId) {
    return false;
  }
  return row.id === messageId
    || row.metadata?.replacedDisplayRowId === messageId;
}

function findTimelineRowIndex(rows, messageId, predicate = () => true) {
  if (!Array.isArray(rows) || typeof messageId !== 'string' || !messageId) {
    return -1;
  }
  return rows.findIndex((row) => timelineRowMatchesMessageId(row, messageId) && predicate(row));
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
  sourceUserMessage,
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
  let supersededTurnRef = null;
  logReplayTimeline('replay_start', {
    conversationRef,
    newTurnRef: replayTurnRef,
    targetUserMessageId,
  });
  try {
    const displayTimeline = await DesktopConversationContinuityService.loadDisplayTimeline(
      sessionInfo.userId,
      conversationRef,
    );
    const rows = Array.isArray(displayTimeline?.rows) ? displayTimeline.rows : [];
    logReplayTimeline('display_timeline_loaded', {
      conversationRef,
      newTurnRef: replayTurnRef,
      sourceRowCount: rows.length,
      targetUserMessageId,
    });
    let userRowIndex = action === 'edit_resend'
      ? findTimelineRowIndex(
        rows,
        targetUserMessageId,
        (row) => row.role === 'user' && row.type === 'user_message',
      )
      : findTimelineRetryUserIndex(rows, messageId);
    let sourceUserRow = userRowIndex >= 0 ? rows[userRowIndex] : null;
    if (userRowIndex < 0 && action === 'edit_resend') {
      sourceUserRow = buildReplaySourceUserRowFromMessage({
        baseRevisionId: displayTimeline.revisionId,
        conversationRef,
        message: sourceUserMessage,
      });
      if (sourceUserRow) {
        userRowIndex = rows.length;
      }
    }
    if (userRowIndex < 0 || !sourceUserRow) {
      throw new Error(`Cannot ${action === 'edit_resend' ? 'edit' : 'retry'} missing display user row`);
    }
    const replayPayload = {
      ...buildReplayAttachmentPayload(sourceUserRow),
      ...buildReplayPreparationPayload({ screenshotRef, screenshotUrl }),
    };
    const replayMetadata = buildReplayDisplayMetadataPayload(sourceUserRow);
    const replayStartedAt = new Date().toISOString();
    const replayAttachments = resolveReplayPendingAttachments(sourceUserRow, pendingAttachments);
    supersededTurnRef = (
      typeof sourceUserRow.turnRef === 'string'
      && sourceUserRow.turnRef.trim()
      && sourceUserRow.turnRef.trim() !== replayTurnRef
    ) ? sourceUserRow.turnRef.trim() : null;
    const pendingTurn = buildReplayPendingTurn({
      attachments: replayAttachments,
      conversationRef,
      turnRef: replayTurnRef,
      text: queryText,
      timestamp: replayStartedAt,
    });
    const replacementRows = [
      ...rows.slice(0, userRowIndex),
      buildReplayReplacementUserRow({
        attachments: replayAttachments,
        baseRevisionId: displayTimeline.revisionId,
        content: queryText,
        pendingTurn,
        replacedRowId: sourceUserRow.metadata?.replacedDisplayRowId ?? sourceUserRow.id,
        sourceRow: sourceUserRow,
        timestamp: replayStartedAt,
      }),
    ];
    logReplayTimeline('replace_rows_start', {
      conversationRef,
      oldTurnRef: supersededTurnRef,
      newTurnRef: replayTurnRef,
      replacementRowCount: replacementRows.length,
      sourceRowCount: rows.length,
      targetUserMessageId,
    });
    await DesktopConversationContinuityService.replaceRows({
      userId: sessionInfo.userId,
      conversationRef,
      baseRevisionId: displayTimeline.revisionId,
      reason: action === 'edit_resend' ? 'user_edit' : 'retry',
      rows: replacementRows,
    });
    logReplayTimeline('replace_rows_done', {
      conversationRef,
      oldTurnRef: supersededTurnRef,
      newTurnRef: replayTurnRef,
      replacementRowCount: replacementRows.length,
      sourceRowCount: rows.length,
      targetUserMessageId,
    });
    useChatStore.getState().acceptReplayPendingTurn({
      conversationRef,
      messages: buildReplayMessagesWithPendingTurn(replayMessages, pendingTurn),
      pendingTurn,
      supersededTurnRef,
    });
    if (supersededTurnRef) {
      logReplayTimeline('stop_old_sent', {
        conversationRef,
        oldTurnRef: supersededTurnRef,
        newTurnRef: replayTurnRef,
        stopAttempted: true,
      });
      void DesktopLiveTurnRuntimeClient.stop(conversationRef, supersededTurnRef)
        .then(() => {
          logReplayTimeline('stop_old_done', {
            conversationRef,
            oldTurnRef: supersededTurnRef,
            newTurnRef: replayTurnRef,
            stopAttempted: true,
            stopSucceeded: true,
          });
        })
        .catch((stopError) => {
          logReplayTimeline('stop_old_failed', {
            conversationRef,
            oldTurnRef: supersededTurnRef,
            newTurnRef: replayTurnRef,
            stopAttempted: true,
            stopSucceeded: false,
            errorKind: traceErrorKind(stopError),
          });
          console.warn('[ChatInterface] Failed to stop superseded replay turn:', stopError);
        });
    }
    DesktopPendingTurnRuntimeClient.setPending(pendingTurn);
    pendingTurnPublished = true;
    logReplayTimeline('pending_published', {
      conversationRef,
      oldTurnRef: supersededTurnRef,
      newTurnRef: replayTurnRef,
      targetUserMessageId,
    });
    try {
      logReplayTimeline('send_new_sent', {
        conversationRef,
        oldTurnRef: supersededTurnRef,
        newTurnRef: replayTurnRef,
        targetUserMessageId,
      });
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
      logReplayTimeline('send_new_done', {
        conversationRef,
        oldTurnRef: supersededTurnRef,
        newTurnRef: replayTurnRef,
        sendSucceeded: true,
        targetUserMessageId,
      });
    } catch (sendError) {
      logReplayTimeline('send_new_failed', {
        conversationRef,
        oldTurnRef: supersededTurnRef,
        newTurnRef: replayTurnRef,
        sendSucceeded: false,
        errorKind: traceErrorKind(sendError),
        targetUserMessageId,
      });
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
    logReplayTimeline('replay_failed_cleanup', {
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
      sourceUserMessage: editUserMessage,
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
