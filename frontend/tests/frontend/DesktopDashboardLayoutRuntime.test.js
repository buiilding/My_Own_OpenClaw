/**
 * Covers renderer dashboard layout runtime helpers.
 */

import { DesktopDashboardLayoutRuntime } from '../../src/renderer/app/runtime/desktopDashboardLayoutRuntime';

const {
  applyDashboardScrollLock,
  getDashboardScrollLockTargets,
  requestDashboardLayoutPass,
  scheduleDashboardOpeningClear,
} = DesktopDashboardLayoutRuntime;

describe('desktopDashboardLayoutRuntime', () => {
  function createTimerApi() {
    let nextId = 0;
    const timers = new Map();
    return {
      timers,
      setTimeout(callback, delayMs) {
        const id = ++nextId;
        timers.set(id, { callback, delayMs });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    };
  }

  function createClassTarget() {
    const classes = new Set();
    return {
      classes,
      classList: {
        add: (className) => classes.add(className),
        remove: (className) => classes.delete(className),
      },
    };
  }

  test('requestDashboardLayoutPass dispatches resize over two animation frames', () => {
    const callbacks = [];
    const eventTarget = {
      dispatchEvent: jest.fn(),
      requestAnimationFrame: jest.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    };

    expect(requestDashboardLayoutPass(eventTarget)).toBe(true);
    expect(eventTarget.dispatchEvent).not.toHaveBeenCalled();

    callbacks.shift()();
    expect(eventTarget.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(eventTarget.dispatchEvent.mock.calls[0][0].type).toBe('resize');
    expect(eventTarget.requestAnimationFrame).toHaveBeenCalledTimes(2);

    callbacks.shift()();
    expect(eventTarget.dispatchEvent).toHaveBeenCalledTimes(2);
  });

  test('requestDashboardLayoutPass falls back to a timeout resize pulse', () => {
    const eventTarget = {
      dispatchEvent: jest.fn(),
      setTimeout: jest.fn((callback) => {
        callback();
        return 1;
      }),
    };

    expect(requestDashboardLayoutPass(eventTarget)).toBe(true);
    expect(eventTarget.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
    expect(eventTarget.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(eventTarget.dispatchEvent.mock.calls[0][0].type).toBe('resize');
  });

  test('requestDashboardLayoutPass no-ops without an event target', () => {
    expect(requestDashboardLayoutPass(null)).toBe(false);
  });

  test('dashboard opening clear timer schedules through adapter and cleans up', () => {
    const timerApi = createTimerApi();
    const onClear = jest.fn();

    const cleanup = scheduleDashboardOpeningClear({
      delayMs: 420,
      onClear,
      timerApi,
    });

    expect(timerApi.timers.size).toBe(1);
    const [timerId, timer] = Array.from(timerApi.timers.entries())[0];
    expect(timer.delayMs).toBe(420);

    timer.callback();
    expect(onClear).toHaveBeenCalledTimes(1);

    cleanup();
    expect(timerApi.timers.has(timerId)).toBe(false);
  });

  test('dashboard opening clear timer invokes immediately without timer adapter', () => {
    const onClear = jest.fn();

    const cleanup = scheduleDashboardOpeningClear({
      onClear,
      timerApi: {},
    });

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toThrow();
  });

  test('dashboard scroll lock applies and removes class on document targets', () => {
    const documentElement = createClassTarget();
    const body = createClassTarget();
    const root = createClassTarget();
    const documentApi = {
      documentElement,
      body,
      getElementById: jest.fn(() => root),
    };

    expect(getDashboardScrollLockTargets({ documentApi })).toEqual([
      documentElement,
      body,
      root,
    ]);

    const cleanup = applyDashboardScrollLock({
      className: 'cg-scroll-locked',
      documentApi,
    });

    for (const target of [documentElement, body, root]) {
      expect(target.classes.has('cg-scroll-locked')).toBe(true);
    }

    cleanup();
    for (const target of [documentElement, body, root]) {
      expect(target.classes.has('cg-scroll-locked')).toBe(false);
    }
  });
});
