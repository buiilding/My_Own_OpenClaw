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

const {
  applyRendererConversationSelection,
} = DesktopConversationSessionRuntime;
const {
  logRendererReplayTrace,
} = DesktopRendererTraceRuntime;

function readExactReplayTargetRowId(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : '';
}

function readExactReplayConversationRef(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function prepareReplayEditIntent({ targetRowId, editedText }) {
  const normalizedTargetRowId = readExactReplayTargetRowId(targetRowId);
  if (typeof editedText !== 'string' || !normalizedTargetRowId) {
    return null;
  }
  return {
    action: 'edit_resend',
    errorPrefix: 'Failed to edit user message',
    queryText: editedText,
    targetRowId: normalizedTargetRowId,
  };
}

function prepareReplayRetryIntent({ targetRowId }) {
  const normalizedTargetRowId = readExactReplayTargetRowId(targetRowId);
  if (!normalizedTargetRowId) {
    return null;
  }
  return {
    action: 'retry',
    errorPrefix: 'Failed to retry assistant message',
    targetRowId: normalizedTargetRowId,
  };
}

function resolveExistingConversationRef(sessionConversationRef) {
  return readExactReplayConversationRef(DesktopTranscriptSessionRuntimeClient.getActiveConversationRef())
    || readExactReplayConversationRef(sessionConversationRef)
    || null;
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
  intent,
  modelSelection,
  sessionInfo,
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
  const conversationRef = resolveExistingConversationRef(sessionInfo.conversationRef);
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
          model: modelSelection || undefined,
        });
      } else {
        await DesktopConversationContinuityService.retryTurn({
          userId: sessionInfo.userId,
          conversationRef,
          messageId: targetRowId,
          model: modelSelection || undefined,
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
  editedText,
  targetRowId,
}) {
  if (action === 'edit_resend') {
    return prepareReplayEditIntent({ targetRowId, editedText });
  }
  if (action === 'retry') {
    return prepareReplayRetryIntent({ targetRowId });
  }
  return null;
}

function resolveReplayModelSelection() {
  return DesktopRendererConfigRuntimeClient.readDeferredQueryModelSelection();
}

async function executeReplayAction({
  action,
  editedText = null,
  targetRowId = null,
}) {
  const intent = prepareReplayActionIntent({
    action,
    editedText,
    targetRowId,
  });
  if (!intent) {
    return undefined;
  }
  const resolvedSessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
  return executeReplayIntent({
    intent,
    modelSelection: resolveReplayModelSelection(),
    sessionInfo: resolvedSessionInfo,
  });
}

export const DesktopConversationReplayRuntime = Object.freeze({
  executeReplayAction,
});
