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
  buildResponseboxHitTestPayload,
  buildResponseboxSizePayload,
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

  test('builds responsebox size payloads from renderer values', () => {
    expect(buildResponseboxSizePayload({
      visible: true,
      width: 240.8,
      height: 120,
      compactHover: true,
      turnRef: ' turn-1 ',
      staleGuardRef: ' guard-1 ',
    })).toEqual({
      visible: true,
      width: 240.8,
      height: 120,
      compact_hover: true,
      turn_ref: 'turn-1',
      stale_guard_ref: 'guard-1',
    });
    expect(buildResponseboxSizePayload({
      visible: false,
      width: 'bad',
      height: null,
      turnRef: '',
      staleGuardRef: undefined,
      dismissed: true,
    })).toEqual({
      visible: false,
      width: 0,
      height: 0,
      turn_ref: null,
      stale_guard_ref: null,
      dismissed: true,
    });
  });

  test('value-level size commands invoke responsebox size payloads', async () => {
    await DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues({
      visible: true,
      width: 320,
      height: 236,
      compactHover: false,
      turnRef: 'turn-2',
      staleGuardRef: 'turn-2',
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'set-responsebox-size',
      {
        visible: true,
        width: 320,
        height: 236,
        compact_hover: false,
        turn_ref: 'turn-2',
        stale_guard_ref: 'turn-2',
      },
    );
  });

  test('value-level hit-test commands invoke responsebox hit-test payloads', async () => {
    expect(buildResponseboxHitTestPayload(true)).toEqual({ active: true });
    expect(buildResponseboxHitTestPayload(1)).toEqual({ active: false });

    await DesktopResponseOverlayRuntimeClient.setResponseboxHitTestActiveValue(false);

    expect(mockInvoke).toHaveBeenCalledWith(
      'set-responsebox-hit-test-active',
      { active: false },
    );
  });
});
