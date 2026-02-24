import React from 'react';
import { act, renderHook } from '@testing-library/react';

import { ON_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { AppStatusProvider } from '../../frontend/src/renderer/app/providers/AppStatusProvider';
import { useAppStatusContext } from '../../frontend/src/renderer/app/providers/AppStatusContext';

describe('AppStatusProvider', () => {
  const listeners = new Map<string, (data: any) => void>();
  let removeListener: jest.Mock;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppStatusProvider>{children}</AppStatusProvider>
  );

  beforeEach(() => {
    jest.useFakeTimers();
    removeListener = jest.fn();
    listeners.clear();

    (window as any).ipc = {
      send: jest.fn(),
      invoke: jest.fn().mockResolvedValue('ok'),
      once: jest.fn(),
      on: jest.fn((channel: string, handler: (data: any) => void) => {
        listeners.set(channel, handler);
        return removeListener;
      }),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (window as any).ipc;
  });

  function emitBackendEvent(data: any): void {
    const handler = listeners.get(ON_CHANNELS.FROM_BACKEND);
    if (!handler) {
      throw new Error('backend listener is not registered');
    }
    act(() => {
      handler(data);
    });
  }

  function expectStatusAfterAdvance(
    result: { current: { saveStatus: string } },
    delayMs: number,
    expectedStatus: string,
  ): void {
    act(() => {
      jest.advanceTimersByTime(delayMs);
    });
    expect(result.current.saveStatus).toBe(expectedStatus);
  }

  test('setSaving transitions to error then idle when backend does not reply', () => {
    const { result } = renderHook(() => useAppStatusContext(), { wrapper });

    expect(result.current.saveStatus).toBe('idle');

    act(() => {
      result.current.setSaving();
    });
    expect(result.current.saveStatus).toBe('saving');

    expectStatusAfterAdvance(result, 10000, 'error');
    expectStatusAfterAdvance(result, 3000, 'idle');
  });

  test('settings-updated clears pending save timeout and resets to idle', () => {
    const { result } = renderHook(() => useAppStatusContext(), { wrapper });

    act(() => {
      result.current.setSaving();
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.saveStatus).toBe('saving');

    emitBackendEvent({ type: 'settings-updated' });
    expect(result.current.saveStatus).toBe('success');

    expectStatusAfterAdvance(result, 5001, 'idle');
  });

  test('matching backend error sets error then resets to idle', () => {
    const { result } = renderHook(() => useAppStatusContext(), { wrapper });

    emitBackendEvent({
      type: 'error',
      payload: { message: 'Failed to update settings: write failed' },
    });
    expect(result.current.saveStatus).toBe('error');

    expectStatusAfterAdvance(result, 3000, 'idle');
  });

  test('ignores backend errors that are not settings-update errors', () => {
    const { result } = renderHook(() => useAppStatusContext(), { wrapper });

    emitBackendEvent({
      type: 'error',
      payload: { message: 'Database timeout' },
    });

    expect(result.current.saveStatus).toBe('idle');
  });

  test('ignores unsupported backend event types', () => {
    const { result } = renderHook(() => useAppStatusContext(), { wrapper });

    emitBackendEvent({ type: 'models-listed', payload: {} });

    expect(result.current.saveStatus).toBe('idle');
  });

  test('cleans up listener on unmount', () => {
    const { unmount } = renderHook(() => useAppStatusContext(), { wrapper });

    unmount();

    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});
