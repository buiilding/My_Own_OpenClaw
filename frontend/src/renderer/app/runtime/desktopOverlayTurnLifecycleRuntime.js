/**
 * Defines overlay turn lifecycle contract values for renderer runtime consumers.
 */

import overlayTurnLifecycleContract from '../../../shared/overlay_turn_lifecycle_contract.json';

function normalizeStateList(states) {
  return Array.isArray(states)
    ? states.filter((state) => typeof state === 'string' && state.trim().length > 0)
    : [];
}

const lifecycleStates = normalizeStateList(overlayTurnLifecycleContract?.states);

export const OVERLAY_TURN_LIFECYCLE = Object.freeze({
  IDLE: lifecycleStates[0] || 'idle',
  PREFLIGHT: lifecycleStates[1] || 'preflight',
  AWAITING: lifecycleStates[2] || 'awaiting',
  ACTIVE: lifecycleStates[3] || 'active',
  TERMINAL: lifecycleStates[4] || 'terminal',
});

const OVERLAY_TURN_PHASE_GROUPS = Object.freeze({
  awaiting: Object.freeze(Array.isArray(overlayTurnLifecycleContract?.phase_groups?.awaiting)
    ? overlayTurnLifecycleContract.phase_groups.awaiting
    : []),
  active: Object.freeze(Array.isArray(overlayTurnLifecycleContract?.phase_groups?.active)
    ? overlayTurnLifecycleContract.phase_groups.active
    : []),
  terminal: Object.freeze(Array.isArray(overlayTurnLifecycleContract?.phase_groups?.terminal)
    ? overlayTurnLifecycleContract.phase_groups.terminal
    : []),
});

const AWAITING_PHASE_SET = new Set(OVERLAY_TURN_PHASE_GROUPS.awaiting);
const ACTIVE_PHASE_SET = new Set(OVERLAY_TURN_PHASE_GROUPS.active);
const TERMINAL_PHASE_SET = new Set(OVERLAY_TURN_PHASE_GROUPS.terminal);

export function resolveOverlayTurnLifecycle({
  phase,
  isSending,
  hasVisibleReply = false,
  transportConnected = true,
}) {
  if (!transportConnected) {
    return OVERLAY_TURN_LIFECYCLE.IDLE;
  }

  if (typeof phase === 'string' && TERMINAL_PHASE_SET.has(phase)) {
    if (isSending === true && !hasVisibleReply) {
      return OVERLAY_TURN_LIFECYCLE.PREFLIGHT;
    }
    return OVERLAY_TURN_LIFECYCLE.TERMINAL;
  }

  if (typeof phase === 'string' && AWAITING_PHASE_SET.has(phase)) {
    return OVERLAY_TURN_LIFECYCLE.AWAITING;
  }

  if (typeof phase === 'string' && ACTIVE_PHASE_SET.has(phase)) {
    return OVERLAY_TURN_LIFECYCLE.ACTIVE;
  }

  if (isSending === true) {
    return OVERLAY_TURN_LIFECYCLE.PREFLIGHT;
  }

  return OVERLAY_TURN_LIFECYCLE.IDLE;
}

export function isOverlayTurnLifecycleBusy(lifecycle) {
  return (
    lifecycle === OVERLAY_TURN_LIFECYCLE.PREFLIGHT
    || lifecycle === OVERLAY_TURN_LIFECYCLE.AWAITING
    || lifecycle === OVERLAY_TURN_LIFECYCLE.ACTIVE
  );
}

export function isOverlayTurnLifecycleAwaiting(lifecycle) {
  return (
    lifecycle === OVERLAY_TURN_LIFECYCLE.PREFLIGHT
    || lifecycle === OVERLAY_TURN_LIFECYCLE.AWAITING
  );
}
