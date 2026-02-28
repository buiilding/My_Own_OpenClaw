const ACTIVE_LOOP_PHASES = Object.freeze([
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
]);

const TERMINAL_STREAM_PHASES = Object.freeze([
  'idle',
  'complete',
  'error',
]);

const OVERLAY_AWAITING_REPLY_PHASES = Object.freeze([
  'awaiting-first-chunk',
  'tool-call',
]);

const OVERLAY_CLEAR_AWAITING_PHASES = Object.freeze([
  'idle',
  'streaming',
  'complete',
  'error',
]);

const ACTIVE_LOOP_PHASE_SET = new Set(ACTIVE_LOOP_PHASES);
const TERMINAL_STREAM_PHASE_SET = new Set(TERMINAL_STREAM_PHASES);
const OVERLAY_AWAITING_REPLY_PHASE_SET = new Set(OVERLAY_AWAITING_REPLY_PHASES);
const OVERLAY_CLEAR_AWAITING_PHASE_SET = new Set(OVERLAY_CLEAR_AWAITING_PHASES);

export function isLoopActivePhase(phase) {
  return typeof phase === 'string' && ACTIVE_LOOP_PHASE_SET.has(phase);
}

export function isTerminalStreamPhase(phase) {
  return typeof phase === 'string' && TERMINAL_STREAM_PHASE_SET.has(phase);
}

export function isAwaitingFirstChunkPhase(phase) {
  return phase === 'awaiting-first-chunk';
}

export function isOverlayAwaitingReplyPhase(phase) {
  return typeof phase === 'string' && OVERLAY_AWAITING_REPLY_PHASE_SET.has(phase);
}

export function shouldOverlayClearAwaitingFirstChunk(phase) {
  return typeof phase === 'string' && OVERLAY_CLEAR_AWAITING_PHASE_SET.has(phase);
}

export function isStopControlAvailablePhase(phase) {
  return isLoopActivePhase(phase);
}

export {
  ACTIVE_LOOP_PHASES,
  TERMINAL_STREAM_PHASES,
  OVERLAY_AWAITING_REPLY_PHASES,
  OVERLAY_CLEAR_AWAITING_PHASES,
};
