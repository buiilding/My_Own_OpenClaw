import { RESPONSE_OVERLAY_PHASE } from '../overlay/responseOverlayPhaseContract';
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

const CHAT_LOOP_INTENT = Object.freeze({
  IDLE: 'idle',
  AWAITING_REPLY: 'awaiting-reply',
  ACTIVE_RESPONSE: 'active-response',
});

const CHAT_LOOP_STATE_TRANSITIONS = Object.freeze({
  [CHAT_LOOP_UI_STATE.IDLE]: Object.freeze({
    [CHAT_LOOP_INTENT.IDLE]: CHAT_LOOP_UI_STATE.IDLE,
    [CHAT_LOOP_INTENT.AWAITING_REPLY]: CHAT_LOOP_UI_STATE.AWAITING_REPLY,
    [CHAT_LOOP_INTENT.ACTIVE_RESPONSE]: CHAT_LOOP_UI_STATE.ACTIVE_RESPONSE,
  }),
  [CHAT_LOOP_UI_STATE.AWAITING_REPLY]: Object.freeze({
    [CHAT_LOOP_INTENT.IDLE]: CHAT_LOOP_UI_STATE.IDLE,
    [CHAT_LOOP_INTENT.AWAITING_REPLY]: CHAT_LOOP_UI_STATE.AWAITING_REPLY,
    [CHAT_LOOP_INTENT.ACTIVE_RESPONSE]: CHAT_LOOP_UI_STATE.ACTIVE_RESPONSE,
  }),
  [CHAT_LOOP_UI_STATE.ACTIVE_RESPONSE]: Object.freeze({
    [CHAT_LOOP_INTENT.IDLE]: CHAT_LOOP_UI_STATE.IDLE,
    [CHAT_LOOP_INTENT.AWAITING_REPLY]: CHAT_LOOP_UI_STATE.AWAITING_REPLY,
    [CHAT_LOOP_INTENT.ACTIVE_RESPONSE]: CHAT_LOOP_UI_STATE.ACTIVE_RESPONSE,
  }),
});

export function resolveChatLoopUiState({
  phase,
  isSending,
  hasVisibleReply = false,
  transportConnected = true,
}) {
  if (!transportConnected) {
    return CHAT_LOOP_STATE_TRANSITIONS[CHAT_LOOP_UI_STATE.IDLE][CHAT_LOOP_INTENT.IDLE];
  }

  if (
    phase === RESPONSE_OVERLAY_PHASE.COMPLETE
    || phase === RESPONSE_OVERLAY_PHASE.ERROR
  ) {
    return CHAT_LOOP_STATE_TRANSITIONS[CHAT_LOOP_UI_STATE.IDLE][CHAT_LOOP_INTENT.IDLE];
  }

  let nextIntent = CHAT_LOOP_INTENT.IDLE;
  if (isSending) {
    nextIntent = CHAT_LOOP_INTENT.AWAITING_REPLY;
  } else if (isAwaitingFirstChunkPhase(phase) || isOverlayAwaitingReplyPhase(phase)) {
    nextIntent = CHAT_LOOP_INTENT.AWAITING_REPLY;
  } else if (phase === RESPONSE_OVERLAY_PHASE.STREAMING) {
    nextIntent = hasVisibleReply
      ? CHAT_LOOP_INTENT.ACTIVE_RESPONSE
      : CHAT_LOOP_INTENT.AWAITING_REPLY;
  } else if (isStopControlAvailablePhase(phase) || isLoopActivePhase(phase)) {
    nextIntent = CHAT_LOOP_INTENT.ACTIVE_RESPONSE;
  }

  return CHAT_LOOP_STATE_TRANSITIONS[CHAT_LOOP_UI_STATE.IDLE][nextIntent];
}

export function isChatLoopBusy(loopUiState) {
  return loopUiState !== CHAT_LOOP_UI_STATE.IDLE;
}

export function isChatLoopAwaitingReply(loopUiState) {
  return loopUiState === CHAT_LOOP_UI_STATE.AWAITING_REPLY;
}
