/**
 * Covers overlay turn lifecycle. behavior in the frontend test suite.
 */

import { DesktopOverlayTurnLifecycleRuntime } from '../../frontend/src/renderer/app/runtime/desktopOverlayTurnLifecycleRuntime';

describe('desktopOverlayTurnLifecycleRuntime', () => {
  const {
    getActiveOverlayTurnLifecycle,
    getAwaitingOverlayTurnLifecycle,
    getIdleOverlayTurnLifecycle,
    getPreflightOverlayTurnLifecycle,
    getTerminalOverlayTurnLifecycle,
    isOverlayTurnLifecycleAwaiting,
    isOverlayTurnLifecycleActive,
    isOverlayTurnLifecycleBusy,
    isOverlayTurnLifecycleIdle,
    isOverlayTurnLifecycleTerminal,
  } = DesktopOverlayTurnLifecycleRuntime;

  test('busy and awaiting helpers track only active lifecycle states', () => {
    expect(DesktopOverlayTurnLifecycleRuntime).not.toHaveProperty('OVERLAY_TURN_LIFECYCLE');
    expect(DesktopOverlayTurnLifecycleRuntime).not.toHaveProperty('OVERLAY_TURN_PHASE_GROUPS');
    expect(DesktopOverlayTurnLifecycleRuntime).not.toHaveProperty('resolveOverlayTurnLifecycle');
    expect(isOverlayTurnLifecycleBusy(getIdleOverlayTurnLifecycle())).toBe(false);
    expect(isOverlayTurnLifecycleBusy(getTerminalOverlayTurnLifecycle())).toBe(false);
    expect(isOverlayTurnLifecycleBusy(getPreflightOverlayTurnLifecycle())).toBe(true);
    expect(isOverlayTurnLifecycleBusy(getAwaitingOverlayTurnLifecycle())).toBe(true);
    expect(isOverlayTurnLifecycleBusy(getActiveOverlayTurnLifecycle())).toBe(true);

    expect(isOverlayTurnLifecycleAwaiting(getPreflightOverlayTurnLifecycle())).toBe(true);
    expect(isOverlayTurnLifecycleAwaiting(getAwaitingOverlayTurnLifecycle())).toBe(true);
    expect(isOverlayTurnLifecycleAwaiting(getActiveOverlayTurnLifecycle())).toBe(false);
    expect(isOverlayTurnLifecycleIdle(getIdleOverlayTurnLifecycle())).toBe(true);
    expect(isOverlayTurnLifecycleActive(getActiveOverlayTurnLifecycle())).toBe(true);
    expect(isOverlayTurnLifecycleTerminal(getTerminalOverlayTurnLifecycle())).toBe(true);
  });
});
