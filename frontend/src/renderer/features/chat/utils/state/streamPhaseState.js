import { RESPONSE_OVERLAY_PHASE } from '../overlay/responseOverlayPhaseContract';

const ACTIVE_LOOP_PHASES = Object.freeze([
  RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK,
  RESPONSE_OVERLAY_PHASE.STREAMING,
  RESPONSE_OVERLAY_PHASE.TOOL_CALL,
  RESPONSE_OVERLAY_PHASE.TOOL_OUTPUT,
]);

const TERMINAL_STREAM_PHASES = Object.freeze([
  RESPONSE_OVERLAY_PHASE.IDLE,
  RESPONSE_OVERLAY_PHASE.COMPLETE,
  RESPONSE_OVERLAY_PHASE.ERROR,
]);

const OVERLAY_AWAITING_REPLY_PHASES = Object.freeze([
  RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK,
  RESPONSE_OVERLAY_PHASE.TOOL_CALL,
  RESPONSE_OVERLAY_PHASE.TOOL_OUTPUT,
]);

const ACTIVE_LOOP_PHASE_SET = new Set(ACTIVE_LOOP_PHASES);
const TERMINAL_STREAM_PHASE_SET = new Set(TERMINAL_STREAM_PHASES);
const OVERLAY_AWAITING_REPLY_PHASE_SET = new Set(OVERLAY_AWAITING_REPLY_PHASES);

export function isLoopActivePhase(phase) {
  return typeof phase === 'string' && ACTIVE_LOOP_PHASE_SET.has(phase);
}

export function isTerminalStreamPhase(phase) {
  return typeof phase === 'string' && TERMINAL_STREAM_PHASE_SET.has(phase);
}

export function isAwaitingFirstChunkPhase(phase) {
  return phase === RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK;
}

export function isOverlayAwaitingReplyPhase(phase) {
  return typeof phase === 'string' && OVERLAY_AWAITING_REPLY_PHASE_SET.has(phase);
}

export function isStopControlAvailablePhase(phase) {
  return isLoopActivePhase(phase);
}
