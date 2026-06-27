/**
 * Covers desktop response overlay runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
let visibilityListener: ((payload?: unknown) => void) | null = null;

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
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

import * as DesktopResponseOverlayRuntimeModule from '../../src/renderer/app/runtime/desktopResponseOverlayRuntimeClient';
import { DesktopResponseOverlayRuntimeClient } from '../../src/renderer/app/runtime/desktopResponseOverlayRuntimeClient';

describe('DesktopResponseOverlayRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    visibilityListener = null;
  });

  test('keeps response overlay value helpers private to the runtime client', () => {
    expect(DesktopResponseOverlayRuntimeModule).not.toHaveProperty('normalizeResponseOverlayVisibilityPayload');
    expect(DesktopResponseOverlayRuntimeModule).not.toHaveProperty('buildResponseboxSizePayload');
    expect(DesktopResponseOverlayRuntimeModule).not.toHaveProperty('buildResponseboxHitTestPayload');
  });

  test('visibility subscriptions emit normalized visibility booleans', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopResponseOverlayRuntimeClient.onResponseOverlayVisibility((event) => {
      events.push(event);
    });

    visibilityListener?.({ visible: true });
    visibilityListener?.({ visible: false });
    visibilityListener?.({ visible: 'yes' });
    visibilityListener?.(null);

    expect(events).toEqual([
      true,
      false,
      false,
      false,
    ]);

    unsubscribe?.();
    expect(visibilityListener).toBeNull();
  });

  test('value-level size commands invoke responsebox size payloads', async () => {
    await DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues({
      visible: true,
      width: 240.8,
      height: 120,
      compactHover: true,
      turnRef: ' turn-1 ',
      staleGuardRef: ' guard-1 ',
    });
    await DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues({
      visible: false,
      width: 'bad',
      height: null,
      turnRef: '',
      staleGuardRef: undefined,
      dismissed: true,
    });
    await DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues({
      visible: true,
      width: 320,
      height: 236,
      compactHover: false,
      turnRef: 'turn-2',
      staleGuardRef: 'turn-2',
    });

    expect(mockInvoke).toHaveBeenNthCalledWith(
      1,
      'set-responsebox-size',
      {
        visible: true,
        width: 240.8,
        height: 120,
        compact_hover: true,
        turn_ref: 'turn-1',
        stale_guard_ref: 'guard-1',
      },
    );
    expect(mockInvoke).toHaveBeenNthCalledWith(
      2,
      'set-responsebox-size',
      {
        visible: false,
        width: 0,
        height: 0,
        turn_ref: null,
        stale_guard_ref: null,
        dismissed: true,
      },
    );
    expect(mockInvoke).toHaveBeenNthCalledWith(
      3,
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

  test('dismissed responsebox helper invokes hidden dismissed payloads with guard refs', async () => {
    await DesktopResponseOverlayRuntimeClient.hideDismissedResponsebox({
      turnRef: ' turn-dismissed ',
      guardRef: ' guard-dismissed ',
    });
    await DesktopResponseOverlayRuntimeClient.hideDismissedResponsebox({
      turnRef: ' turn-fallback ',
      guardRef: '',
    });

    expect(mockInvoke).toHaveBeenNthCalledWith(
      1,
      'set-responsebox-size',
      {
        visible: false,
        width: 0,
        height: 0,
        turn_ref: 'turn-dismissed',
        stale_guard_ref: 'guard-dismissed',
        dismissed: true,
      },
    );
    expect(mockInvoke).toHaveBeenNthCalledWith(
      2,
      'set-responsebox-size',
      {
        visible: false,
        width: 0,
        height: 0,
        turn_ref: 'turn-fallback',
        stale_guard_ref: 'turn-fallback',
        dismissed: true,
      },
    );
  });

  test('value-level hit-test commands invoke responsebox hit-test payloads', async () => {
    await DesktopResponseOverlayRuntimeClient.setResponseboxHitTestActiveValue(true);
    await DesktopResponseOverlayRuntimeClient.setResponseboxHitTestActiveValue(1);

    expect(mockInvoke).toHaveBeenNthCalledWith(
      1,
      'set-responsebox-hit-test-active',
      { active: true },
    );
    expect(mockInvoke).toHaveBeenNthCalledWith(
      2,
      'set-responsebox-hit-test-active',
      { active: false },
    );
  });
});
