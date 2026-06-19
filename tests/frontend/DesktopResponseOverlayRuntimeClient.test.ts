/**
 * Covers desktop response overlay runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
let visibilityListener: ((payload?: unknown) => void) | null = null;

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (_channel: string, listener: (payload?: unknown) => void) => {
      visibilityListener = listener;
      return () => {
        visibilityListener = null;
      };
    },
  },
  INVOKE_CHANNELS: {
    SET_RESPONSEBOX_SIZE: 'set-responsebox-size',
    SET_RESPONSEBOX_HIT_TEST_ACTIVE: 'set-responsebox-hit-test-active',
  },
  ON_CHANNELS: {
    RESPONSE_OVERLAY_VISIBILITY: 'response-overlay-visibility',
  },
}));

import {
  DesktopResponseOverlayRuntimeClient,
  normalizeResponseOverlayVisibilityPayload,
} from '../../frontend/src/renderer/app/runtime/desktopResponseOverlayRuntimeClient';

describe('DesktopResponseOverlayRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    visibilityListener = null;
  });

  test('normalizes response overlay visibility payloads', () => {
    expect(normalizeResponseOverlayVisibilityPayload({ visible: true })).toEqual({
      visible: true,
    });
    expect(normalizeResponseOverlayVisibilityPayload({ visible: false })).toEqual({
      visible: false,
    });
    expect(normalizeResponseOverlayVisibilityPayload({ visible: 'yes' })).toEqual({
      visible: false,
    });
    expect(normalizeResponseOverlayVisibilityPayload(null)).toEqual({
      visible: false,
    });
  });

  test('visibility subscriptions emit normalized visibility booleans', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopResponseOverlayRuntimeClient.onResponseOverlayVisibility((event) => {
      events.push(event);
    });

    visibilityListener?.({ visible: true });
    visibilityListener?.({ visible: 'yes' });

    expect(events).toEqual([
      true,
      false,
    ]);

    unsubscribe?.();
    expect(visibilityListener).toBeNull();
  });
});
