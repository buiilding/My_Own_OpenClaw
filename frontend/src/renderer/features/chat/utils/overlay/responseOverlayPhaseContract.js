/**
 * Defines response overlay phase contract contracts for the renderer UI.
 */

import responseOverlayPhaseContract from '../../../../../shared/response_overlay_phase_contract.json';

const RESPONSE_OVERLAY_PHASES = Object.freeze(
  [...(responseOverlayPhaseContract?.phases || [])],
);

export const RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF = responseOverlayPhaseContract?.preflight?.guard_ref;

export const RESPONSE_OVERLAY_PHASE = Object.freeze(Object.fromEntries(
  RESPONSE_OVERLAY_PHASES.map((phase) => [
    phase.toUpperCase().replace(/-/g, '_'),
    phase,
  ]),
));
