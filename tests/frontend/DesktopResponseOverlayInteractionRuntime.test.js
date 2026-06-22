/**
 * Covers response overlay browser interaction adapters.
 */

import { DesktopResponseOverlayInteractionRuntime } from '../../frontend/src/renderer/app/runtime/desktopResponseOverlayInteractionRuntime';

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

function createShell(bounds) {
  return {
    getBoundingClientRect: jest.fn(() => bounds),
  };
}

describe('DesktopResponseOverlayInteractionRuntime', () => {
  test('reports responsebox hit-test state from pointer bounds', () => {
    const eventTarget = createEventTarget();
    const onHitTestActiveChange = jest.fn();
    const shell = createShell({
      bottom: 170,
      left: 20,
      right: 520,
      top: 10,
    });

    const cleanup = DesktopResponseOverlayInteractionRuntime.subscribeToResponseboxHitTestEvents({
      eventTarget,
      onHitTestActiveChange,
      shellRef: { current: shell },
    });

    eventTarget.dispatch('mousemove', { clientX: 260, clientY: 60 });
    eventTarget.dispatch('mousemove', { clientX: 260, clientY: 4 });
    eventTarget.dispatch('mouseleave');
    eventTarget.dispatch('blur');

    expect(onHitTestActiveChange).toHaveBeenNthCalledWith(1, true);
    expect(onHitTestActiveChange).toHaveBeenNthCalledWith(2, false);
    expect(onHitTestActiveChange).toHaveBeenNthCalledWith(3, false);
    expect(onHitTestActiveChange).toHaveBeenNthCalledWith(4, false);

    cleanup();
    expect(eventTarget.listeners.size).toBe(0);
  });

  test('treats missing shell bounds or invalid pointer coordinates as inactive', () => {
    expect(DesktopResponseOverlayInteractionRuntime.isPointerInsideResponsebox({
      event: { clientX: 20, clientY: 20 },
      shellRef: { current: null },
    })).toBe(false);

    expect(DesktopResponseOverlayInteractionRuntime.isPointerInsideResponsebox({
      event: { clientX: 'x', clientY: 20 },
      shellRef: {
        current: createShell({
          bottom: 20,
          left: 0,
          right: 20,
          top: 0,
        }),
      },
    })).toBe(false);
  });

  test('returns noop cleanup when browser events are unavailable', () => {
    const cleanup = DesktopResponseOverlayInteractionRuntime.subscribeToResponseboxHitTestEvents({
      eventTarget: null,
      onHitTestActiveChange: jest.fn(),
      shellRef: { current: createShell({ bottom: 1, left: 0, right: 1, top: 0 }) },
    });

    expect(cleanup()).toBeUndefined();
  });
});
