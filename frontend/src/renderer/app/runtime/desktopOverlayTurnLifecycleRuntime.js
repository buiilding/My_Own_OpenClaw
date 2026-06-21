/**
 * Defines overlay turn lifecycle contract values for renderer app-runtime consumers.
 */

import overlayTurnLifecycleContract from '../../../shared/overlay_turn_lifecycle_contract.json';

function normalizeStateList(states) {
  return Array.isArray(states)
    ? states.filter((state) => typeof state === 'string' && state.trim().length > 0)
    : [];
}

const lifecycleStates = normalizeStateList(overlayTurnLifecycleContract?.states);

const OVERLAY_TURN_LIFECYCLE = Object.freeze({
  IDLE: lifecycleStates[0] || 'idle',
  PREFLIGHT: lifecycleStates[1] || 'preflight',
  AWAITING: lifecycleStates[2] || 'awaiting',
  ACTIVE: lifecycleStates[3] || 'active',
  TERMINAL: lifecycleStates[4] || 'terminal',
});

function getIdleOverlayTurnLifecycle() {
  return OVERLAY_TURN_LIFECYCLE.IDLE;
}

function getPreflightOverlayTurnLifecycle() {
  return OVERLAY_TURN_LIFECYCLE.PREFLIGHT;
}

function getAwaitingOverlayTurnLifecycle() {
  return OVERLAY_TURN_LIFECYCLE.AWAITING;
}

function getActiveOverlayTurnLifecycle() {
  return OVERLAY_TURN_LIFECYCLE.ACTIVE;
}

function getTerminalOverlayTurnLifecycle() {
  return OVERLAY_TURN_LIFECYCLE.TERMINAL;
}

function isOverlayTurnLifecycleIdle(lifecycle) {
  return lifecycle === OVERLAY_TURN_LIFECYCLE.IDLE;
}

function isOverlayTurnLifecycleActive(lifecycle) {
  return lifecycle === OVERLAY_TURN_LIFECYCLE.ACTIVE;
}

function isOverlayTurnLifecycleTerminal(lifecycle) {
  return lifecycle === OVERLAY_TURN_LIFECYCLE.TERMINAL;
}

function isOverlayTurnLifecycleBusy(lifecycle) {
  return (
    lifecycle === OVERLAY_TURN_LIFECYCLE.PREFLIGHT
    || lifecycle === OVERLAY_TURN_LIFECYCLE.AWAITING
    || lifecycle === OVERLAY_TURN_LIFECYCLE.ACTIVE
  );
}

function isOverlayTurnLifecycleAwaiting(lifecycle) {
  return (
    lifecycle === OVERLAY_TURN_LIFECYCLE.PREFLIGHT
    || lifecycle === OVERLAY_TURN_LIFECYCLE.AWAITING
  );
}

export const DesktopOverlayTurnLifecycleRuntime = Object.freeze({
  getIdleOverlayTurnLifecycle,
  getPreflightOverlayTurnLifecycle,
  getAwaitingOverlayTurnLifecycle,
  getActiveOverlayTurnLifecycle,
  getTerminalOverlayTurnLifecycle,
  isOverlayTurnLifecycleIdle,
  isOverlayTurnLifecycleActive,
  isOverlayTurnLifecycleTerminal,
  isOverlayTurnLifecycleBusy,
  isOverlayTurnLifecycleAwaiting,
});
