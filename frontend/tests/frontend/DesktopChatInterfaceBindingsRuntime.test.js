/**
 * Covers chat interface bindings runtime behavior in the frontend test suite.
 */

import { DesktopChatInterfaceBindingsRuntime } from '../../src/renderer/app/runtime/desktopChatInterfaceBindingsRuntime';

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

function shortcutEvent(overrides = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    key: '',
    metaKey: false,
    repeat: false,
    preventDefault: jest.fn(),
    stopImmediatePropagation: jest.fn(),
    stopPropagation: jest.fn(),
    ...overrides,
  };
}

describe('desktopChatInterfaceBindingsRuntime', () => {
  test('focuses and selects input refs through the runtime adapter', () => {
    const input = {
      focus: jest.fn(),
      select: jest.fn(),
    };

    expect(DesktopChatInterfaceBindingsRuntime.focusAndSelectInput({ current: input })).toBe(true);
    expect(input.focus).toHaveBeenCalledTimes(1);
    expect(input.select).toHaveBeenCalledTimes(1);
  });

  test('focus and select adapter tolerates unavailable inputs and missing select APIs', () => {
    expect(DesktopChatInterfaceBindingsRuntime.focusAndSelectInput({ current: null })).toBe(false);

    const input = {
      focus: jest.fn(),
    };

    expect(DesktopChatInterfaceBindingsRuntime.focusAndSelectInput(input)).toBe(true);
    expect(input.focus).toHaveBeenCalledTimes(1);
  });

  test('dismisses each menu whose container does not contain the pointer target', () => {
    const eventTarget = createEventTarget();
    const providerTarget = {};
    const outsideTarget = {};
    const dismissProvider = jest.fn();
    const dismissModel = jest.fn();

    const cleanup = DesktopChatInterfaceBindingsRuntime.subscribeToMenuDismiss({
      eventTarget,
      menus: [
        {
          ref: { current: { contains: (target) => target === providerTarget } },
          dismiss: dismissProvider,
        },
        {
          ref: { current: { contains: () => false } },
          dismiss: dismissModel,
        },
      ],
    });

    eventTarget.dispatch('mousedown', { target: providerTarget });
    expect(dismissProvider).not.toHaveBeenCalled();
    expect(dismissModel).toHaveBeenCalledTimes(1);

    eventTarget.dispatch('mousedown', { target: outsideTarget });
    expect(dismissProvider).toHaveBeenCalledTimes(1);
    expect(dismissModel).toHaveBeenCalledTimes(2);

    cleanup();
    expect(eventTarget.listeners.size).toBe(0);
  });

  test('handles local stop shortcut only when stop is available', () => {
    const eventTarget = createEventTarget();
    const onStop = jest.fn();
    const event = shortcutEvent({ key: 'Escape' });

    DesktopChatInterfaceBindingsRuntime.subscribeToStopShortcut({
      canStop: true,
      eventTarget,
      onStop,
    });

    eventTarget.dispatch('keydown', event);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);

    const idleEventTarget = createEventTarget();
    const idleStop = jest.fn();
    const idleEvent = shortcutEvent({ key: 'Escape' });
    DesktopChatInterfaceBindingsRuntime.subscribeToStopShortcut({
      canStop: false,
      eventTarget: idleEventTarget,
      onStop: idleStop,
    });

    idleEventTarget.dispatch('keydown', idleEvent);
    expect(idleStop).not.toHaveBeenCalled();
    expect(idleEvent.preventDefault).not.toHaveBeenCalled();
  });

  test('opens and closes thread find from keyboard shortcuts', () => {
    const eventTarget = createEventTarget();
    const onOpenFind = jest.fn();
    const onCloseFind = jest.fn();

    DesktopChatInterfaceBindingsRuntime.subscribeToFindShortcut({
      eventTarget,
      isFindOpen: true,
      onOpenFind,
      onCloseFind,
    });

    const openEvent = shortcutEvent({ ctrlKey: true, key: 'f' });
    eventTarget.dispatch('keydown', openEvent);
    expect(onOpenFind).toHaveBeenCalledTimes(1);
    expect(openEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(openEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(openEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);

    const closeEvent = shortcutEvent({ key: 'Escape' });
    eventTarget.dispatch('keydown', closeEvent);
    expect(onCloseFind).toHaveBeenCalledTimes(1);
    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  test('ignores prevented or modified find shortcuts', () => {
    const eventTarget = createEventTarget();
    const onOpenFind = jest.fn();

    DesktopChatInterfaceBindingsRuntime.subscribeToFindShortcut({
      eventTarget,
      onOpenFind,
    });

    eventTarget.dispatch('keydown', shortcutEvent({
      ctrlKey: true,
      defaultPrevented: true,
      key: 'f',
    }));
    eventTarget.dispatch('keydown', shortcutEvent({
      altKey: true,
      ctrlKey: true,
      key: 'f',
    }));

    expect(onOpenFind).not.toHaveBeenCalled();
  });

  test('subscribes and cleans up window focus events', () => {
    const eventTarget = createEventTarget();
    const onFocus = jest.fn();

    const cleanup = DesktopChatInterfaceBindingsRuntime.subscribeToWindowFocus({
      eventTarget,
      onFocus,
    });

    eventTarget.dispatch('focus');
    expect(onFocus).toHaveBeenCalledTimes(1);

    cleanup();
    expect(eventTarget.listeners.size).toBe(0);
  });

  test('schedules deferred focus with animation frame cleanup', () => {
    const focus = jest.fn();
    const callbacks = new Map();
    const animationFrameApi = {
      requestAnimationFrame: jest.fn((callback) => {
        callbacks.set(100, callback);
        return 100;
      }),
      cancelAnimationFrame: jest.fn((frameId) => {
        callbacks.delete(frameId);
      }),
    };

    const cleanup = DesktopChatInterfaceBindingsRuntime.scheduleDeferredFocus({
      animationFrameApi,
      focus,
    });

    expect(animationFrameApi.requestAnimationFrame).toHaveBeenCalledWith(focus);
    cleanup();
    expect(animationFrameApi.cancelAnimationFrame).toHaveBeenCalledWith(100);
    expect(callbacks.size).toBe(0);
  });

  test('focuses immediately when animation frame scheduling is unavailable', () => {
    const focus = jest.fn();

    const cleanup = DesktopChatInterfaceBindingsRuntime.scheduleDeferredFocus({
      animationFrameApi: {},
      focus,
    });

    expect(focus).toHaveBeenCalledTimes(1);
    expect(cleanup()).toBeUndefined();
  });
});
