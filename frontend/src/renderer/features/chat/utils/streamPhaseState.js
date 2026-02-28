const ACTIVE_LOOP_PHASES = Object.freeze([
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
]);

const ACTIVE_LOOP_PHASE_SET = new Set(ACTIVE_LOOP_PHASES);

export function isLoopActivePhase(phase) {
  return typeof phase === 'string' && ACTIVE_LOOP_PHASE_SET.has(phase);
}

export function isStopControlAvailablePhase(phase) {
  return isLoopActivePhase(phase);
}

export { ACTIVE_LOOP_PHASES };
