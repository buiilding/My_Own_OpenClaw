/**
 * Defines response overlay phase contracts for the renderer app-runtime.
 */

import responseOverlayPhaseContract from '../../../shared/response_overlay_phase_contract.json';

const RESPONSE_OVERLAY_PHASES = Object.freeze(
  [...(responseOverlayPhaseContract?.phases || [])],
);

const RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF = responseOverlayPhaseContract?.preflight?.guard_ref;

const RESPONSE_OVERLAY_PHASE = Object.freeze(Object.fromEntries(
  RESPONSE_OVERLAY_PHASES.map((phase) => [
    phase.toUpperCase().replace(/-/g, '_'),
    phase,
  ]),
));

export function getResponseOverlayPhaseValues() {
  return [...RESPONSE_OVERLAY_PHASES];
}

export function getResponseOverlayPhaseMap() {
  return { ...RESPONSE_OVERLAY_PHASE };
}

export function getResponseOverlayPreflightGuardRef() {
  return RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF;
}

export function getIdleResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.IDLE;
}

export function getAwaitingFirstChunkResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK;
}

export function getStreamingResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.STREAMING;
}

export function getToolCallResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.TOOL_CALL;
}

export function getToolOutputResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.TOOL_OUTPUT;
}

export function getCompleteResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.COMPLETE;
}

export function getErrorResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.ERROR;
}

export function isAwaitingFirstChunkResponseOverlayPhase(phase) {
  return phase === RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK;
}

export function isStreamingResponseOverlayPhase(phase) {
  return phase === RESPONSE_OVERLAY_PHASE.STREAMING;
}
