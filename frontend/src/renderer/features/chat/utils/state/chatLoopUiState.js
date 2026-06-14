/**
 * Provides the chat loop ui state module for the renderer UI.
 */

import {
  isOverlayTurnLifecycleAwaiting,
} from './overlayTurnLifecycleState';
import { OVERLAY_TURN_LIFECYCLE } from '../overlay/overlayTurnLifecycleContract';
import { isOverlayAwaitingReplyPhase } from './streamPhaseState';

const CHAT_LOOP_UI_STATE = Object.freeze({
  IDLE: 'idle',
  AWAITING_REPLY: 'awaiting-reply',
  ACTIVE_RESPONSE: 'active-response',
});

export function resolveChatLoopUiState({
  lifecycle,
  phase,
  hasVisibleReply = false,
}) {
  if (lifecycle === OVERLAY_TURN_LIFECYCLE.IDLE || lifecycle === OVERLAY_TURN_LIFECYCLE.TERMINAL) {
    return CHAT_LOOP_UI_STATE.IDLE;
  }

  if (isOverlayTurnLifecycleAwaiting(lifecycle)) {
    return CHAT_LOOP_UI_STATE.AWAITING_REPLY;
  }

  if (lifecycle === OVERLAY_TURN_LIFECYCLE.ACTIVE) {
    if (isOverlayAwaitingReplyPhase(phase)) {
      return CHAT_LOOP_UI_STATE.AWAITING_REPLY;
    }
    return hasVisibleReply
      ? CHAT_LOOP_UI_STATE.ACTIVE_RESPONSE
      : CHAT_LOOP_UI_STATE.AWAITING_REPLY;
  }

  return CHAT_LOOP_UI_STATE.IDLE;
}

export function isChatLoopBusy(loopUiState) {
  return loopUiState !== CHAT_LOOP_UI_STATE.IDLE;
}

export function isChatLoopAwaitingReply(loopUiState) {
  return loopUiState === CHAT_LOOP_UI_STATE.AWAITING_REPLY;
}
