import { RESPONSE_OVERLAY_PHASE } from './responseOverlayPhaseContract';
import {
  isAwaitingFirstChunkPhase,
  isLoopActivePhase,
  isOverlayAwaitingReplyPhase,
  isStopControlAvailablePhase,
} from './streamPhaseState';

const CHAT_LOOP_UI_STATE = Object.freeze({
  IDLE: 'idle',
  AWAITING_REPLY: 'awaiting-reply',
  ACTIVE_RESPONSE: 'active-response',
});

export function resolveChatLoopUiState({
  phase,
  isSending,
  hasVisibleReply = false,
}) {
  if (isSending) {
    return CHAT_LOOP_UI_STATE.AWAITING_REPLY;
  }

  if (isAwaitingFirstChunkPhase(phase) || isOverlayAwaitingReplyPhase(phase)) {
    return CHAT_LOOP_UI_STATE.AWAITING_REPLY;
  }

  if (phase === RESPONSE_OVERLAY_PHASE.STREAMING) {
    return hasVisibleReply
      ? CHAT_LOOP_UI_STATE.ACTIVE_RESPONSE
      : CHAT_LOOP_UI_STATE.AWAITING_REPLY;
  }

  if (isStopControlAvailablePhase(phase) || isLoopActivePhase(phase)) {
    return CHAT_LOOP_UI_STATE.ACTIVE_RESPONSE;
  }

  return CHAT_LOOP_UI_STATE.IDLE;
}

export function isChatLoopBusy(loopUiState) {
  return loopUiState !== CHAT_LOOP_UI_STATE.IDLE;
}

export function isChatLoopAwaitingReply(loopUiState) {
  return loopUiState === CHAT_LOOP_UI_STATE.AWAITING_REPLY;
}
