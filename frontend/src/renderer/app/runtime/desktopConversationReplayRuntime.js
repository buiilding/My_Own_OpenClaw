/**
 * Provides renderer conversation replay projection helpers.
 */

import { DesktopConversationContinuityService } from './desktopConversationContinuityService';
import {
  DesktopConversationSessionRuntime,
} from './desktopConversationSessionRuntime';
import { DesktopRendererConfigRuntimeClient } from './desktopRendererConfigRuntimeClient';
import { DesktopRendererTraceRuntime } from './desktopRendererTraceRuntime';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from './desktopWorkspaceRuntimeClient';

const {
  applyRendererConversationSelection,
} = DesktopConversationSessionRuntime;
const {
  logRendererReplayTrace,
} = DesktopRendererTraceRuntime;

function readExactReplayMessageId(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : '';
}

function readExactReplayConversationRef(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function prepareReplayEditIntent({ userMessageId, editedText }) {
  const normalizedMessageId = readExactReplayMessageId(userMessageId);
  if (typeof editedText !== 'string' || !normalizedMessageId) {
    return null;
  }
  return {
    action: 'edit_resend',
    errorPrefix: 'Failed to edit user message',
    queryText: editedText,
    targetRowId: normalizedMessageId,
  };
}

function prepareReplayRetryIntent({ assistantMessageId }) {
  const normalizedMessageId = readExactReplayMessageId(assistantMessageId);
  if (!normalizedMessageId) {
    return null;
  }
  return {
    action: 'retry',
    errorPrefix: 'Failed to retry assistant message',
    targetRowId: normalizedMessageId,
  };
}

function resolveExistingConversationRef(sessionConversationRef, storeConversationRef) {
  return readExactReplayConversationRef(DesktopTranscriptSessionRuntimeClient.getActiveConversationRef())
    || readExactReplayConversationRef(sessionConversationRef)
    || readExactReplayConversationRef(storeConversationRef);
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

function logReplayTimeline(action, {
  conversationRef,
  ...values
}) {
  logRendererReplayTrace({
    action,
    conversationRef,
    ...values,
  });
}

async function executeReplayIntent({
  deferredQueryModelSelection,
  intent,
  sessionInfo,
  storeConversationRef,
}) {
  if (!intent) {
    return false;
  }
  const {
    action,
    errorPrefix,
    queryText,
    targetRowId,
  } = intent;
  const conversationRef = resolveExistingConversationRef(
    sessionInfo.conversationRef,
    storeConversationRef,
  );
  if (!conversationRef) {
    console.error(`[ChatInterface] ${errorPrefix}: missing active conversation`);
    logRendererReplayTrace({
      action: 'replay_failed_cleanup',
      conversationRef: null,
      errorKind: 'MissingConversationRef',
      targetRowId,
    });
    return false;
  }
  const workspaceBinding = DesktopWorkspaceRuntimeClient.getConversationWorkspaceBinding(conversationRef);
  applyRendererConversationSelection({
    conversationRef,
    userId: sessionInfo.userId || undefined,
    updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
  });
  logReplayTimeline('replay_start', {
    conversationRef,
    targetRowId,
  });
  try {
    const sdkReplayPayload = {
      ...(workspaceBinding.workspacePath ? { workspace_path: workspaceBinding.workspacePath } : {}),
    };
    try {
      logReplayTimeline('sdk_replay_sent', {
        conversationRef,
        action,
        targetRowId,
      });
      if (action === 'edit_resend') {
        await DesktopConversationContinuityService.editAndResend({
          userId: sessionInfo.userId,
          conversationRef,
          messageId: targetRowId,
          text: queryText,
          payload: sdkReplayPayload,
          model: deferredQueryModelSelection || undefined,
        });
      } else {
        await DesktopConversationContinuityService.retryTurn({
          userId: sessionInfo.userId,
          conversationRef,
          messageId: targetRowId,
          payload: sdkReplayPayload,
          model: deferredQueryModelSelection || undefined,
        });
      }
      logReplayTimeline('sdk_replay_done', {
        conversationRef,
        action,
        replaySucceeded: true,
        targetRowId,
      });
    } catch (sdkReplayError) {
      logReplayTimeline('sdk_replay_failed', {
        conversationRef,
        action,
        replaySucceeded: false,
        errorKind: traceErrorKind(sdkReplayError),
        targetRowId,
      });
      if (sdkReplayError && typeof sdkReplayError === 'object') {
        sdkReplayError.__desktopRuntimeReplayStep = 'send';
      }
      throw sdkReplayError;
    }
    return true;
  } catch (error) {
    console.error(`[ChatInterface] ${errorPrefix}:`, error);
    logReplayTimeline('replay_failed_cleanup', {
      conversationRef,
      errorKind: traceErrorKind(error),
      targetRowId,
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
  deferredQueryModelSelection,
} = {}) {
  return deferredQueryModelSelection
    ?? DesktopRendererConfigRuntimeClient.readDeferredQueryModelSelection();
}

async function executeReplayAction({
  action,
  assistantMessageId = null,
  deferredQueryModelSelection,
  editedText = null,
  replayUiContext = null,
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
  const storeConversationRef = typeof replayUiContext?.getActiveConversationRef === 'function'
    ? replayUiContext.getActiveConversationRef()
    : null;
  return executeReplayIntent({
    deferredQueryModelSelection: resolveReplayModelSelection({
      deferredQueryModelSelection,
    }),
    intent,
    sessionInfo: resolvedSessionInfo,
    storeConversationRef,
  });
}

export const DesktopConversationReplayRuntime = Object.freeze({
  executeReplayAction,
});
