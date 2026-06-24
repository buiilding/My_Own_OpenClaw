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
import { DesktopPendingTurnRuntimeClient } from '../../../app/runtime/desktopPendingTurnRuntimeClient';
import { DesktopRendererTraceRuntime } from '../../../app/runtime/desktopRendererTraceRuntime';

const chatSkin = DesktopRuntimeSkin.desktopRuntimeSkin.chat;
const {
  buildReplayMessagesWithPendingTurn,
  buildReplayPendingTurn,
  buildReplayContextMessages,
  buildReplayPreparationPayload,
  findReplayEditableUserMessageIndex,
  resolveReplayRetryMessageIndexes,
} = DesktopConversationReplayRuntime;
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
  const workspace = typeof state.getWorkspaceState === 'function'
    ? state.getWorkspaceState(conversationRef)
    : state;
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
    const replayPayload = {
      ...buildReplayPreparationPayload({ screenshotRef, screenshotUrl }),
    };
    const sdkReplayPayload = {
      ...replayPayload,
      ...(workspaceBinding.workspacePath ? { workspace_path: workspaceBinding.workspacePath } : {}),
    };
    const replayStartedAt = new Date().toISOString();
    const replayAttachments = Array.isArray(pendingAttachments) && pendingAttachments.length > 0
      ? pendingAttachments
      : null;
    supersededTurnRef = (
      typeof sourceUserMessage?.turnRef === 'string'
      && sourceUserMessage.turnRef.trim()
      && sourceUserMessage.turnRef.trim() !== replayTurnRef
    ) ? sourceUserMessage.turnRef.trim() : null;
    const pendingTurn = buildReplayPendingTurn({
      attachments: replayAttachments,
      conversationRef,
      turnRef: replayTurnRef,
      text: queryText,
      timestamp: replayStartedAt,
    });
    useChatStore.getState().acceptReplayPendingTurn({
      conversationRef,
      messages: buildReplayMessagesWithPendingTurn(replayMessages, pendingTurn),
      pendingTurn,
      supersededTurnRef,
    });
    DesktopPendingTurnRuntimeClient.setPending(pendingTurn);
    pendingTurnPublished = true;
    logReplayTimeline('pending_published', {
      conversationRef,
      oldTurnRef: supersededTurnRef,
      newTurnRef: replayTurnRef,
      targetUserMessageId,
    });
    try {
      logReplayTimeline('sdk_replay_sent', {
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
      logReplayTimeline('sdk_replay_done', {
        conversationRef,
        oldTurnRef: supersededTurnRef,
        newTurnRef: replayTurnRef,
        action,
        replaySucceeded: true,
        targetUserMessageId,
      });
    } catch (sdkReplayError) {
      logReplayTimeline('sdk_replay_failed', {
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
      pendingAttachments: retryUserMessage.attachments,
      sourceUserMessage: retryUserMessage,
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
