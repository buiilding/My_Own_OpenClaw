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
    resolveOverlayTurnLifecycle,
  } = DesktopOverlayTurnLifecycleRuntime;

  test('treats local send latch as preflight before main phase advances', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'idle',
      isSending: true,
      hasVisibleReply: false,
    })).toBe('preflight');
  });

  test('maps awaiting-first-chunk phase to awaiting lifecycle', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'awaiting-first-chunk',
      isSending: false,
      hasVisibleReply: false,
    })).toBe('awaiting');
  });

  test('maps streaming and tool phases to active lifecycle', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'streaming',
      isSending: false,
      hasVisibleReply: false,
    })).toBe('active');
    expect(resolveOverlayTurnLifecycle({
      phase: 'tool-output',
      isSending: false,
      hasVisibleReply: false,
    })).toBe('active');
  });

  test('keeps terminal phase in preflight when a new send is already staged', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'complete',
      isSending: true,
      hasVisibleReply: false,
    })).toBe('preflight');
  });

  test('forces idle lifecycle when transport is disconnected', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'tool-call',
      isSending: true,
      hasVisibleReply: false,
      transportConnected: false,
    })).toBe('idle');
  });

  test('busy and awaiting helpers track only active lifecycle states', () => {
    expect(DesktopOverlayTurnLifecycleRuntime).not.toHaveProperty('OVERLAY_TURN_LIFECYCLE');
    expect(DesktopOverlayTurnLifecycleRuntime).not.toHaveProperty('OVERLAY_TURN_PHASE_GROUPS');
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
