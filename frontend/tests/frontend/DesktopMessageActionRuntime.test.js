/**
 * Covers desktop message action runtime timer adapters.
 */

import { DesktopMessageActionRuntime } from '../../src/renderer/app/runtime/desktopMessageActionRuntime';

function createWindowApi() {
  let nextTimerId = 1;
  const timers = new Map();
  return {
    setTimeout: jest.fn((callback, delayMs) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delayMs });
      return id;
    }),
    clearTimeout: jest.fn((id) => {
      timers.delete(id);
    }),
    runTimer(id) {
      timers.get(id)?.callback();
    },
    timers,
  };
}

describe('desktopMessageActionRuntime', () => {
  test('schedules, replaces, and clears message action timers', () => {
    const windowApi = createWindowApi();
    const timerRef = { current: null };
    const callback = jest.fn();

    expect(DesktopMessageActionRuntime.scheduleMessageActionTimer({
      timerRef,
      callback,
      delayMs: 4000,
      windowApi,
    })).toBe(1);
    expect(timerRef.current).toBe(1);

    expect(DesktopMessageActionRuntime.scheduleMessageActionTimer({
      timerRef,
      callback,
      delayMs: 2000,
      windowApi,
    })).toBe(2);
    expect(windowApi.clearTimeout).toHaveBeenCalledWith(1);
    expect(timerRef.current).toBe(2);

    windowApi.runTimer(1);
    expect(callback).not.toHaveBeenCalled();

    windowApi.runTimer(2);
    expect(timerRef.current).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);

    DesktopMessageActionRuntime.scheduleMessageActionTimer({
      timerRef,
      callback,
      delayMs: 4000,
      windowApi,
    });
    expect(DesktopMessageActionRuntime.clearMessageActionTimer({
      timerRef,
      windowApi,
    })).toBe(true);
    expect(windowApi.clearTimeout).toHaveBeenCalledWith(3);
    expect(timerRef.current).toBeNull();
  });

  test('runs callback immediately when timer adapter is unavailable', () => {
    const timerRef = { current: null };
    const callback = jest.fn();

    expect(DesktopMessageActionRuntime.scheduleMessageActionTimer({
      timerRef,
      callback,
      delayMs: 4000,
      windowApi: {},
    })).toBeNull();

    expect(timerRef.current).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('resolves replay action availability from SDK row actions only', () => {
    expect(DesktopMessageActionRuntime.resolveMessageReplayActions({
      id: 'assistant-visible',
      actions: {
        canRetry: true,
        retryTargetRowId: ' assistant-original ',
        canEdit: false,
        editTargetRowId: ' user-original ',
      },
    })).toEqual({
      canRetryMessage: true,
      canEditMessage: false,
      retryTargetMessageId: 'assistant-original',
      editTargetMessageId: 'user-original',
    });

    expect(DesktopMessageActionRuntime.resolveMessageReplayActions({
      id: 'assistant-visible',
      actions: {
        canRetry: 'true',
        canEdit: true,
      },
    })).toEqual({
      canRetryMessage: false,
      canEditMessage: true,
      retryTargetMessageId: 'assistant-visible',
      editTargetMessageId: 'assistant-visible',
    });
  });
});
