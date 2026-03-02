import { RESPONSE_OVERLAY_PHASE } from './responseOverlayPhaseContract';
import {
  isLoopActivePhase,
  isOverlayAwaitingReplyPhase,
} from './streamPhaseState';

const CHATBOX_SURFACE_STATE = Object.freeze({
  COMPACT: 'compact',
  AWAITING_REPLY: 'awaiting-reply',
  RESPONSE: 'response',
});

export function hasVisibleChatboxResponse(activeResponse, dismissedResponseId) {
  return Boolean(activeResponse && activeResponse.id !== dismissedResponseId);
}

export function resolveChatboxSurfaceState({
  overlayPhase,
  isSending,
  hasVisibleResponse,
}) {
  // One renderer projection for the minimal pill: compact, waiting, or response.
  if (hasVisibleResponse && !isOverlayAwaitingReplyPhase(overlayPhase)) {
    return CHATBOX_SURFACE_STATE.RESPONSE;
  }

  const waitingForFirstVisibleChunk = (
    overlayPhase === RESPONSE_OVERLAY_PHASE.STREAMING
    && !hasVisibleResponse
  );

  if (
    isSending
    || isOverlayAwaitingReplyPhase(overlayPhase)
    || waitingForFirstVisibleChunk
  ) {
    return CHATBOX_SURFACE_STATE.AWAITING_REPLY;
  }

  return CHATBOX_SURFACE_STATE.COMPACT;
}

export function isChatboxLoopInteractionLocked({
  overlayPhase,
  isSending,
}) {
  return Boolean(isSending || isLoopActivePhase(overlayPhase));
}

export function shouldShowChatboxAwaitingReply(surfaceState) {
  return surfaceState === CHATBOX_SURFACE_STATE.AWAITING_REPLY;
}

export function shouldShowChatboxResponse(surfaceState) {
  return surfaceState === CHATBOX_SURFACE_STATE.RESPONSE;
}
