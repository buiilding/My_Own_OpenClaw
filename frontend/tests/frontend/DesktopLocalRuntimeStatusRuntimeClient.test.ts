/**
 * Covers desktop local-runtime status client behavior in the frontend test suite.
 */

const mockGetSnapshot = jest.fn();
const mockSubscribe = jest.fn();

jest.mock('../../src/renderer/infrastructure/runtime/localRuntimeStatusStore', () => ({
  getLocalRuntimeStatusSnapshot: () => mockGetSnapshot(),
  subscribeLocalRuntimeStatusStore: (listener: () => void) => mockSubscribe(listener),
}));

import * as DesktopLocalRuntimeStatusRuntimeModule from '../../src/renderer/app/runtime/desktopLocalRuntimeStatusRuntimeClient';
import { DesktopLocalRuntimeStatusRuntimeClient } from '../../src/renderer/app/runtime/desktopLocalRuntimeStatusRuntimeClient';

describe('DesktopLocalRuntimeStatusRuntimeClient', () => {
  beforeEach(() => {
    mockGetSnapshot.mockReset();
    mockSubscribe.mockReset();
  });

  test('keeps raw local-runtime status readiness parsing private to the runtime client', () => {
    expect(DesktopLocalRuntimeStatusRuntimeModule).not.toHaveProperty('isLocalRuntimeStatusReady');
  });

  test('projects raw local-runtime status snapshots to readiness values', () => {
    mockGetSnapshot.mockReturnValueOnce({ ready: true, status: 'ready' });
    expect(DesktopLocalRuntimeStatusRuntimeClient.isReady()).toBe(true);

    mockGetSnapshot.mockReturnValueOnce({ ready: false, status: 'starting' });
    expect(DesktopLocalRuntimeStatusRuntimeClient.isReady()).toBe(false);

    mockGetSnapshot.mockReturnValueOnce(null);
    expect(DesktopLocalRuntimeStatusRuntimeClient.isReady()).toBe(false);
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
