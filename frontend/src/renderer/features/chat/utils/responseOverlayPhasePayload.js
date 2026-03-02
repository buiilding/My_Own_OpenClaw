import {
  isResponseOverlayPhase,
  normalizeResponseOverlayNumber,
  normalizeResponseOverlayString,
  RESPONSE_OVERLAY_METADATA_KEYS,
} from './responseOverlayPhaseContract';

export function parseResponseOverlayPhasePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const phase = normalizeResponseOverlayString(payload.phase);
  if (!phase || !isResponseOverlayPhase(phase)) {
    return null;
  }

  const normalizedPayload = {
    phase,
    source: normalizeResponseOverlayString(payload.source),
  };
  RESPONSE_OVERLAY_METADATA_KEYS.forEach((key) => {
    if (key === 'attempt' || key === 'max_attempts') {
      normalizedPayload[key] = normalizeResponseOverlayNumber(payload[key]);
      return;
    }
    normalizedPayload[key] = normalizeResponseOverlayString(payload[key]);
  });
  return normalizedPayload;
}
