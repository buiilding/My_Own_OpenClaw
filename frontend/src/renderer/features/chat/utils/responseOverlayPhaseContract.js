export const RESPONSE_OVERLAY_PHASES = Object.freeze([
  'idle',
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
  'complete',
  'error',
]);

export const RESPONSE_OVERLAY_METADATA_KEYS = Object.freeze([
  'correlation_id',
  'attempt',
  'max_attempts',
  'recovery_stage',
  'failure_reason',
]);

export const RESPONSE_OVERLAY_PHASE = Object.freeze(Object.fromEntries(
  RESPONSE_OVERLAY_PHASES.map((phase) => [
    phase.toUpperCase().replace(/-/g, '_'),
    phase,
  ]),
));

const RESPONSE_OVERLAY_PHASE_SET = new Set(RESPONSE_OVERLAY_PHASES);

export function isResponseOverlayPhase(phase) {
  return typeof phase === 'string' && RESPONSE_OVERLAY_PHASE_SET.has(phase);
}

export function normalizeResponseOverlayString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeResponseOverlayNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
