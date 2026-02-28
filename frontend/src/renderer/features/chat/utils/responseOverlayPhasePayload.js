export const RESPONSE_OVERLAY_PHASES = Object.freeze([
  'idle',
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
  'complete',
  'error',
]);

const RESPONSE_OVERLAY_PHASE_SET = new Set(RESPONSE_OVERLAY_PHASES);

function resolveString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function parseResponseOverlayPhasePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const phase = resolveString(payload.phase);
  if (!phase || !RESPONSE_OVERLAY_PHASE_SET.has(phase)) {
    return null;
  }

  return {
    phase,
    source: resolveString(payload.source),
    correlation_id: resolveString(payload.correlation_id),
    attempt: resolveFiniteNumber(payload.attempt),
    max_attempts: resolveFiniteNumber(payload.max_attempts),
    recovery_stage: resolveString(payload.recovery_stage),
    failure_reason: resolveString(payload.failure_reason),
  };
}
