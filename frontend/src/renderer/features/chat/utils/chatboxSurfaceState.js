import {
  isChatLoopAwaitingReply,
} from './chatLoopUiState';

const CHATBOX_SURFACE_STATE = Object.freeze({
  COMPACT: 'compact',
  AWAITING_REPLY: 'awaiting-reply',
  RESPONSE: 'response',
});

export function hasVisibleChatboxResponse(activeResponse, dismissedResponseId) {
  return Boolean(activeResponse && activeResponse.id !== dismissedResponseId);
}

export function resolveChatboxSurfaceStateFromLoopUiState({
  loopUiState,
  hasVisibleResponse,
}) {
  if (hasVisibleResponse && !isChatLoopAwaitingReply(loopUiState)) {
    return CHATBOX_SURFACE_STATE.RESPONSE;
  }

  if (isChatLoopAwaitingReply(loopUiState)) {
    return CHATBOX_SURFACE_STATE.AWAITING_REPLY;
  }

  return CHATBOX_SURFACE_STATE.COMPACT;
}

export function shouldShowChatboxAwaitingReply(surfaceState) {
  return surfaceState === CHATBOX_SURFACE_STATE.AWAITING_REPLY;
}

export function shouldShowChatboxResponse(surfaceState) {
  return surfaceState === CHATBOX_SURFACE_STATE.RESPONSE;
}
