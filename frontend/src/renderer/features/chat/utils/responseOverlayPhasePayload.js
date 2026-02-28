import {
  isResponseOverlayPhase,
  normalizeResponseOverlayNumber,
  normalizeResponseOverlayString,
  RESPONSE_OVERLAY_PHASES,
} from './responseOverlayPhaseContract';

export { RESPONSE_OVERLAY_PHASES };

export function parseResponseOverlayPhasePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const phase = normalizeResponseOverlayString(payload.phase);
  if (!phase || !isResponseOverlayPhase(phase)) {
    return null;
  }

  return {
    phase,
    source: normalizeResponseOverlayString(payload.source),
    correlation_id: normalizeResponseOverlayString(payload.correlation_id),
    attempt: normalizeResponseOverlayNumber(payload.attempt),
    max_attempts: normalizeResponseOverlayNumber(payload.max_attempts),
    recovery_stage: normalizeResponseOverlayString(payload.recovery_stage),
    failure_reason: normalizeResponseOverlayString(payload.failure_reason),
  };
}
