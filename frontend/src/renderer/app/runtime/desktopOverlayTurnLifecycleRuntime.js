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

export const OVERLAY_TURN_PHASE_GROUPS = Object.freeze({
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
