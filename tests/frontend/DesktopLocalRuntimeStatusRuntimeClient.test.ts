/**
 * Covers desktop local-runtime status client behavior in the frontend test suite.
 */

const mockGetSnapshot = jest.fn();
const mockSubscribe = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/runtime/localRuntimeStatusStore', () => ({
  getLocalRuntimeStatusSnapshot: () => mockGetSnapshot(),
  subscribeLocalRuntimeStatusStore: (listener: () => void) => mockSubscribe(listener),
}));

import {
  DesktopLocalRuntimeStatusRuntimeClient,
  isLocalRuntimeStatusReady,
} from '../../frontend/src/renderer/app/runtime/desktopLocalRuntimeStatusRuntimeClient';

describe('DesktopLocalRuntimeStatusRuntimeClient', () => {
  beforeEach(() => {
    mockGetSnapshot.mockReset();
    mockSubscribe.mockReset();
  });

  test('projects raw local-runtime status snapshots to readiness values', () => {
    expect(isLocalRuntimeStatusReady({ ready: true, status: 'ready' })).toBe(true);
    expect(isLocalRuntimeStatusReady({ ready: false, status: 'starting' })).toBe(false);
    expect(isLocalRuntimeStatusReady(null)).toBe(false);

    mockGetSnapshot.mockReturnValue({ ready: true, status: 'ready' });
    expect(DesktopLocalRuntimeStatusRuntimeClient.isReady()).toBe(true);
  });

  test('ready subscriptions notify only through the value-level ready helper', () => {
    const unsubscribe = jest.fn();
    let storeListener: (() => void) | null = null;
    const readyListener = jest.fn();

    mockGetSnapshot
      .mockReturnValueOnce({ ready: false, status: 'starting' })
      .mockReturnValueOnce({ ready: true, status: 'ready' });
    mockSubscribe.mockImplementation((listener) => {
      storeListener = listener;
      return unsubscribe;
    });

    expect(DesktopLocalRuntimeStatusRuntimeClient.onReady(readyListener)).toBe(unsubscribe);
    expect(readyListener).not.toHaveBeenCalled();

    storeListener?.();

    expect(readyListener).toHaveBeenCalledTimes(1);
  });
});
