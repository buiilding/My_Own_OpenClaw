/**
 * Provides renderer conversation replay projection helpers.
 */

import { DesktopConversationContinuityService } from './desktopConversationContinuityService';
import {
  DesktopConversationSessionRuntime,
} from './desktopConversationSessionRuntime';
import { DesktopRendererTraceRuntime } from './desktopRendererTraceRuntime';
import { DesktopTranscriptSessionRuntimeClient } from './desktopTranscriptSessionRuntimeClient';

const {
  applyRendererConversationSelection,
} = DesktopConversationSessionRuntime;
const {
  logRendererReplayTrace,
} = DesktopRendererTraceRuntime;

function readExactReplayConversationRef(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
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
  action,
  errorPrefix,
  queryText,
  targetRowId,
}) {
  const sessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo();
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
        replayAction: action,
        targetRowId,
      });
      if (action === 'edit_resend') {
        await DesktopConversationContinuityService.editAndResend({
          userId: sessionInfo.userId,
          conversationRef,
          messageId: targetRowId,
          text: queryText,
        });
      } else {
        await DesktopConversationContinuityService.retryTurn({
          userId: sessionInfo.userId,
          conversationRef,
          messageId: targetRowId,
        });
      }
      logReplayTimeline('sdk_replay_done', {
        conversationRef,
        replayAction: action,
        replaySucceeded: true,
        targetRowId,
      });
    } catch (sdkReplayError) {
      logReplayTimeline('sdk_replay_failed', {
        conversationRef,
        replayAction: action,
        replaySucceeded: false,
        errorKind: traceErrorKind(sdkReplayError),
        targetRowId,
      });
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

async function executeReplayAction({
  action,
  editedText = null,
  targetRowId = null,
}) {
  if (action !== 'edit_resend' && action !== 'retry') {
    return undefined;
  }
  return executeReplayIntent({
    action,
    errorPrefix: action === 'edit_resend'
      ? 'Failed to edit user message'
      : 'Failed to retry assistant message',
    queryText: editedText,
    targetRowId,
  });
}

export const DesktopConversationReplayRuntime = Object.freeze({
  executeReplayAction,
});
