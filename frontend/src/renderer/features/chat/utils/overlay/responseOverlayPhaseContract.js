/**
 * Defines response overlay phase contract contracts for the renderer UI.
 */

import responseOverlayPhaseContract from '../../../../../shared/response_overlay_phase_contract.json';

const RESPONSE_OVERLAY_PHASES = Object.freeze(
  [...(responseOverlayPhaseContract?.phases || [])],
);

export const RESPONSE_OVERLAY_METADATA_KEYS = Object.freeze(
  [...(responseOverlayPhaseContract?.metadata_keys || [])],
);

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
