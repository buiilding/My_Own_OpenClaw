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

function getResponseOverlayPhaseValues() {
  return [...RESPONSE_OVERLAY_PHASES];
}

function getResponseOverlayPhaseMap() {
  return { ...RESPONSE_OVERLAY_PHASE };
}

function getResponseOverlayPreflightGuardRef() {
  return RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF;
}

function getIdleResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.IDLE;
}

function getAwaitingFirstChunkResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK;
}

function getStreamingResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.STREAMING;
}

function getToolCallResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.TOOL_CALL;
}

function getToolOutputResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.TOOL_OUTPUT;
}

function getCompleteResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.COMPLETE;
}

function getErrorResponseOverlayPhase() {
  return RESPONSE_OVERLAY_PHASE.ERROR;
}

function isAwaitingFirstChunkResponseOverlayPhase(phase) {
  return phase === RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK;
}

function isStreamingResponseOverlayPhase(phase) {
  return phase === RESPONSE_OVERLAY_PHASE.STREAMING;
}

export const DesktopResponseOverlayPhaseRuntime = Object.freeze({
  getResponseOverlayPhaseValues,
  getResponseOverlayPhaseMap,
  getResponseOverlayPreflightGuardRef,
  getIdleResponseOverlayPhase,
  getAwaitingFirstChunkResponseOverlayPhase,
  getStreamingResponseOverlayPhase,
  getToolCallResponseOverlayPhase,
  getToolOutputResponseOverlayPhase,
  getCompleteResponseOverlayPhase,
  getErrorResponseOverlayPhase,
  isAwaitingFirstChunkResponseOverlayPhase,
  isStreamingResponseOverlayPhase,
});
