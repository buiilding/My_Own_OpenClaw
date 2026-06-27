/**
 * Covers renderer outside-dismiss runtime behavior in the frontend test suite.
 */

import { DesktopDismissOnOutsideRuntime } from '../../src/renderer/app/runtime/desktopDismissOnOutsideRuntime';

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

describe('desktopDismissOnOutsideRuntime', () => {
  test('dismisses on outside pointer events and ignores inside pointer events', () => {
    const eventTarget = createEventTarget();
    const insideTarget = {};
    const outsideTarget = {};
    const containerRef = {
      current: {
        contains: (target) => target === insideTarget,
      },
    };
    const onDismiss = jest.fn();

    const cleanup = DesktopDismissOnOutsideRuntime.subscribeToDismissOnOutside({
      containerRef,
      eventTarget,
      onDismiss,
    });

    eventTarget.dispatch('mousedown', { target: insideTarget });
    expect(onDismiss).not.toHaveBeenCalled();

    eventTarget.dispatch('mousedown', { target: outsideTarget });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    cleanup();
    expect(eventTarget.listeners.size).toBe(0);
  });

  test('dismisses on escape key and ignores other keys', () => {
    const eventTarget = createEventTarget();
    const onDismiss = jest.fn();

    DesktopDismissOnOutsideRuntime.subscribeToDismissOnOutside({
      eventTarget,
      onDismiss,
    });

    eventTarget.dispatch('keydown', { key: 'Enter' });
    expect(onDismiss).not.toHaveBeenCalled();

    eventTarget.dispatch('keydown', { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('can subscribe only to pointer dismissal', () => {
    const eventTarget = createEventTarget();

    DesktopDismissOnOutsideRuntime.subscribeToDismissOnOutside({
      containerRef: { current: { contains: () => false } },
      dismissOnEscape: false,
      eventTarget,
      onDismiss: jest.fn(),
    });

    expect(eventTarget.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(eventTarget.addEventListener).not.toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  test('returns inert cleanup when event target is unavailable', () => {
    const cleanup = DesktopDismissOnOutsideRuntime.subscribeToDismissOnOutside({
      eventTarget: null,
      onDismiss: jest.fn(),
    });

    expect(() => cleanup()).not.toThrow();
  });
});
