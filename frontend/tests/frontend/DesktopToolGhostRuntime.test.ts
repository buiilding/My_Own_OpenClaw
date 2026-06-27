/**
 * Covers desktop tool ghost runtime behavior in the frontend test suite.
 */

import { DesktopToolGhostRuntime } from '../../src/renderer/app/runtime/desktopToolGhostRuntime';

function createTimerApi() {
  let nextId = 0;
  const timers = new Map<number, { callback: () => void; delayMs: number }>();
  return {
    timers,
    setTimeout(callback: () => void, delayMs: number) {
      const id = ++nextId;
      timers.set(id, { callback, delayMs });
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  };
}

describe('DesktopToolGhostRuntime', () => {
  test('returns the full click sync delay for debug track timing', () => {
    expect(DesktopToolGhostRuntime.getToolGhostClickSyncDelayMs()).toBe(3200);
  });

  test('schedules, replaces, runs, and clears debug timers through the adapter', () => {
    const timerApi = createTimerApi();
    const timerRef: { current: number | null } = { current: null };
    const firstCallback = jest.fn();
    const secondCallback = jest.fn();

    DesktopToolGhostRuntime.scheduleToolGhostTimer({
      timerRef,
      delayMs: 100,
      callback: firstCallback,
      timerApi,
    });
    const firstTimerId = timerRef.current;
    expect(firstTimerId).toBe(1);
    expect(timerApi.timers.get(1)?.delayMs).toBe(100);

    DesktopToolGhostRuntime.scheduleToolGhostTimer({
      timerRef,
      delayMs: 700,
      callback: secondCallback,
      timerApi,
    });
    expect(timerApi.timers.has(1)).toBe(false);
    expect(timerRef.current).toBe(2);
    expect(timerApi.timers.get(2)?.delayMs).toBe(700);

    timerApi.timers.get(2)?.callback();
    expect(timerRef.current).toBeNull();
    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);

    DesktopToolGhostRuntime.scheduleToolGhostTimer({
      timerRef,
      delayMs: 300,
      callback: firstCallback,
      timerApi,
    });
    expect(timerRef.current).toBe(3);
    DesktopToolGhostRuntime.clearToolGhostTimer({ timerRef, timerApi });
    expect(timerRef.current).toBeNull();
    expect(timerApi.timers.has(3)).toBe(false);
  });

  test('runs immediately when the timer adapter is unavailable', () => {
    const timerRef = { current: null };
    const callback = jest.fn();

    const timerId = DesktopToolGhostRuntime.scheduleToolGhostTimer({
      timerRef,
      callback,
      timerApi: {},
    });

    expect(timerId).toBeNull();
    expect(timerRef.current).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
