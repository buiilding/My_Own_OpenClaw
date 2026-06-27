/**
 * Covers renderer app provider browser adapter runtime behavior.
 */

import { DesktopAppProviderRuntime } from '../../src/renderer/app/runtime/desktopAppProviderRuntime';

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

describe('desktopAppProviderRuntime', () => {
  test('subscribes and cleans up app provider keydown events', () => {
    const eventTarget = createEventTarget();
    const onKeyDown = jest.fn();

    const cleanup = DesktopAppProviderRuntime.subscribeToAppProviderKeyDown({
      eventTarget,
      onKeyDown,
    });

    eventTarget.dispatch('keydown', { key: 'Tab' });
    expect(onKeyDown).toHaveBeenCalledWith({ key: 'Tab' });

    cleanup();
    expect(eventTarget.listeners.size).toBe(0);
  });

  test('subscribes and cleans up app config storage events', () => {
    const eventTarget = createEventTarget();
    const onStorage = jest.fn();

    const cleanup = DesktopAppProviderRuntime.subscribeToAppConfigStorageEvents({
      eventTarget,
      onStorage,
    });

    eventTarget.dispatch('storage', { key: 'config' });
    expect(onStorage).toHaveBeenCalledWith({ key: 'config' });

    cleanup();
    expect(eventTarget.listeners.size).toBe(0);
  });

  test('detects editable shortcut targets through injected DOM constructors', () => {
    class ElementCtor {
      closest() {
        return null;
      }
    }
    class HtmlElementCtor extends ElementCtor {}

    const nestedEditableTarget = new HtmlElementCtor();
    nestedEditableTarget.closest = jest.fn(() => ({}));

    expect(DesktopAppProviderRuntime.isEditableShortcutTarget(nestedEditableTarget, {
      elementCtor: ElementCtor,
      htmlElementCtor: HtmlElementCtor,
    })).toBe(true);

    const contentEditableTarget = new HtmlElementCtor();
    contentEditableTarget.isContentEditable = true;
    expect(DesktopAppProviderRuntime.isEditableShortcutTarget(contentEditableTarget, {
      elementCtor: ElementCtor,
      htmlElementCtor: HtmlElementCtor,
    })).toBe(true);

    const plainTarget = new HtmlElementCtor();
    plainTarget.isContentEditable = false;
    expect(DesktopAppProviderRuntime.isEditableShortcutTarget(plainTarget, {
      elementCtor: ElementCtor,
      htmlElementCtor: HtmlElementCtor,
    })).toBe(false);
  });

  test('schedules, replaces, and clears provider timers', () => {
    const timerApi = createTimerApi();
    const timerRef = { current: null };
    const callback = jest.fn();

    expect(DesktopAppProviderRuntime.scheduleProviderTimer({
      timerRef,
      callback,
      delayMs: 3000,
      timerApi,
    })).toBe(1);
    expect(DesktopAppProviderRuntime.scheduleProviderTimer({
      timerRef,
      callback,
      delayMs: 10000,
      timerApi,
    })).toBe(2);
    expect(timerApi.clearTimeout).toHaveBeenCalledWith(1);

    timerApi.runTimer(1);
    expect(callback).not.toHaveBeenCalled();

    timerApi.runTimer(2);
    expect(timerRef.current).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);

    DesktopAppProviderRuntime.scheduleProviderTimer({
      timerRef,
      callback,
      delayMs: 3000,
      timerApi,
    });
    expect(DesktopAppProviderRuntime.clearProviderTimer({
      timerRef,
      timerApi,
    })).toBe(true);
    expect(timerApi.clearTimeout).toHaveBeenCalledWith(3);
    expect(timerRef.current).toBeNull();
  });

  test('runs provider timer immediately without timer adapter', () => {
    const timerRef = { current: null };
    const callback = jest.fn();

    expect(DesktopAppProviderRuntime.scheduleProviderTimer({
      timerRef,
      callback,
      delayMs: 3000,
      timerApi: {},
    })).toBeNull();

    expect(timerRef.current).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
