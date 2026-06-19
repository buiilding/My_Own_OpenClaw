/**
 * Provides the overlay turn lifecycle state module for the renderer UI.
 */

import { OVERLAY_TURN_LIFECYCLE, OVERLAY_TURN_PHASE_GROUPS } from '../../../../app/runtime/desktopOverlayTurnLifecycleRuntime';

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
