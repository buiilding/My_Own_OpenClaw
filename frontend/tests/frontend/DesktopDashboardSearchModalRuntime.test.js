/**
 * Covers dashboard search modal runtime browser adapters.
 */

import { DesktopDashboardSearchModalRuntime } from '../../src/renderer/app/runtime/desktopDashboardSearchModalRuntime';

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener: jest.fn((type, listener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: jest.fn((type, listener) => {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    }),
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
    listeners,
  };
}

function createTimerApi() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout: jest.fn((callback, delayMs) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delayMs });
      return id;
    }),
    clearTimeout: jest.fn((id) => {
      timers.delete(id);
    }),
    run(id) {
      timers.get(id)?.callback();
    },
    timers,
  };
}

describe('desktopDashboardSearchModalRuntime', () => {
  test('focuses the search input after the modal focus delay', () => {
    const eventTarget = createEventTarget();
    const timerApi = createTimerApi();
    const focus = jest.fn();

    DesktopDashboardSearchModalRuntime.startSearchModalLifecycle({
      eventTarget,
      focusDelayMs: 25,
      inputRef: { current: { focus } },
      onClose: jest.fn(),
      timerApi,
    });

    expect(timerApi.setTimeout).toHaveBeenCalledWith(expect.any(Function), 25);
    expect(focus).not.toHaveBeenCalled();

    timerApi.run(1);

    expect(focus).toHaveBeenCalledTimes(1);
  });

  test('closes on Escape and ignores other keys', () => {
    const eventTarget = createEventTarget();
    const timerApi = createTimerApi();
    const onClose = jest.fn();

    DesktopDashboardSearchModalRuntime.startSearchModalLifecycle({
      eventTarget,
      inputRef: { current: null },
      onClose,
      timerApi,
    });

    eventTarget.dispatch('keydown', { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();

    const escapeEvent = { key: 'Escape' };
    eventTarget.dispatch('keydown', escapeEvent);

    expect(onClose).toHaveBeenCalledWith(escapeEvent);
  });

  test('cleans up focus timer and keyboard listener', () => {
    const eventTarget = createEventTarget();
    const timerApi = createTimerApi();

    const cleanup = DesktopDashboardSearchModalRuntime.startSearchModalLifecycle({
      eventTarget,
      inputRef: { current: null },
      onClose: jest.fn(),
      timerApi,
    });

    cleanup();

    expect(timerApi.clearTimeout).toHaveBeenCalledWith(1);
    expect(eventTarget.listeners.size).toBe(0);
  });

  test('focuses immediately when no timer adapter is available', () => {
    const focus = jest.fn();

    const cleanup = DesktopDashboardSearchModalRuntime.startSearchModalLifecycle({
      eventTarget: null,
      inputRef: { current: { focus } },
      onClose: jest.fn(),
      timerApi: null,
    });

    expect(focus).toHaveBeenCalledTimes(1);
    expect(cleanup).toEqual(expect.any(Function));
  });
});
