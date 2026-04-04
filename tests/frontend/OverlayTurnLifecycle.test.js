import { OVERLAY_TURN_LIFECYCLE } from '../../frontend/src/renderer/features/chat/utils/overlay/overlayTurnLifecycleContract';
import {
  isOverlayTurnLifecycleAwaiting,
  isOverlayTurnLifecycleBusy,
  resolveOverlayTurnLifecycle,
} from '../../frontend/src/renderer/features/chat/utils/state/overlayTurnLifecycleState';

describe('overlayTurnLifecycleState', () => {
  test('treats local send latch as preflight before main phase advances', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'idle',
      isSending: true,
      hasVisibleReply: false,
    })).toBe(OVERLAY_TURN_LIFECYCLE.PREFLIGHT);
  });

  test('maps awaiting-first-chunk phase to awaiting lifecycle', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'awaiting-first-chunk',
      isSending: false,
      hasVisibleReply: false,
    })).toBe(OVERLAY_TURN_LIFECYCLE.AWAITING);
  });

  test('maps streaming and tool phases to active lifecycle', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'streaming',
      isSending: false,
      hasVisibleReply: false,
    })).toBe(OVERLAY_TURN_LIFECYCLE.ACTIVE);
    expect(resolveOverlayTurnLifecycle({
      phase: 'tool-output',
      isSending: false,
      hasVisibleReply: false,
    })).toBe(OVERLAY_TURN_LIFECYCLE.ACTIVE);
  });

  test('keeps terminal phase in preflight when a new send is already staged', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'complete',
      isSending: true,
      hasVisibleReply: false,
    })).toBe(OVERLAY_TURN_LIFECYCLE.PREFLIGHT);
  });

  test('forces idle lifecycle when transport is disconnected', () => {
    expect(resolveOverlayTurnLifecycle({
      phase: 'tool-call',
      isSending: true,
      hasVisibleReply: false,
      transportConnected: false,
    })).toBe(OVERLAY_TURN_LIFECYCLE.IDLE);
  });

  test('busy and awaiting helpers track only active lifecycle states', () => {
    expect(isOverlayTurnLifecycleBusy(OVERLAY_TURN_LIFECYCLE.IDLE)).toBe(false);
    expect(isOverlayTurnLifecycleBusy(OVERLAY_TURN_LIFECYCLE.TERMINAL)).toBe(false);
    expect(isOverlayTurnLifecycleBusy(OVERLAY_TURN_LIFECYCLE.PREFLIGHT)).toBe(true);
    expect(isOverlayTurnLifecycleBusy(OVERLAY_TURN_LIFECYCLE.AWAITING)).toBe(true);
    expect(isOverlayTurnLifecycleBusy(OVERLAY_TURN_LIFECYCLE.ACTIVE)).toBe(true);

    expect(isOverlayTurnLifecycleAwaiting(OVERLAY_TURN_LIFECYCLE.PREFLIGHT)).toBe(true);
    expect(isOverlayTurnLifecycleAwaiting(OVERLAY_TURN_LIFECYCLE.AWAITING)).toBe(true);
    expect(isOverlayTurnLifecycleAwaiting(OVERLAY_TURN_LIFECYCLE.ACTIVE)).toBe(false);
  });
});
