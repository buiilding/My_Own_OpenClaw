/**
 * Covers response overlay browser interaction adapters.
 */

import { DesktopResponseOverlayInteractionRuntime } from '../../src/renderer/app/runtime/desktopResponseOverlayInteractionRuntime';

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

function createWindowApi() {
  let nextFrameId = 100;
  let nextTimeoutId = 1;
  const frames = new Map();
  const timeouts = new Map();
  return {
    requestAnimationFrame: jest.fn((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: jest.fn((id) => {
      frames.delete(id);
    }),
    setTimeout: jest.fn((callback, delayMs) => {
      const id = nextTimeoutId;
      nextTimeoutId += 1;
      timeouts.set(id, { callback, delayMs });
      return id;
    }),
    clearTimeout: jest.fn((id) => {
      timeouts.delete(id);
    }),
    runFrame(id) {
      frames.get(id)?.(0);
    },
    runTimeout(id) {
      timeouts.get(id)?.callback();
    },
    frames,
    timeouts,
  };
}

function createResizeObserverCtor(instances) {
  return class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnect = jest.fn();
      this.observe = jest.fn();
      instances.push(this);
    }
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

  test('schedules and cancels response overlay frame callbacks', () => {
    const windowApi = createWindowApi();
    const callback = jest.fn();

    const cleanup = DesktopResponseOverlayInteractionRuntime.scheduleResponseOverlayFrame({
      callback,
      windowApi,
    });

    expect(windowApi.requestAnimationFrame).toHaveBeenCalledWith(expect.any(Function));
    cleanup();
    expect(windowApi.cancelAnimationFrame).toHaveBeenCalledWith(100);
    windowApi.runFrame(100);
    expect(callback).not.toHaveBeenCalled();
  });

  test('runs response overlay size updates from initial frame, retry, observer, and cleanup', () => {
    const windowApi = createWindowApi();
    const resizeObserverInstances = [];
    const ResizeObserverCtor = createResizeObserverCtor(resizeObserverInstances);
    const shell = createShell({
      bottom: 100,
      left: 0,
      right: 100,
      top: 0,
    });
    const onSizeUpdate = jest.fn();

    const cleanup = DesktopResponseOverlayInteractionRuntime.startResponseOverlaySizeUpdateSync({
      resizeObserverCtor: ResizeObserverCtor,
      shellRef: { current: shell },
      onSizeUpdate,
      windowApi,
    });

    expect(windowApi.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(windowApi.setTimeout).toHaveBeenCalledWith(expect.any(Function), 40);
    expect(resizeObserverInstances[0].observe).toHaveBeenCalledWith(shell);

    windowApi.runFrame(100);
    expect(onSizeUpdate).toHaveBeenCalledTimes(1);

    windowApi.runTimeout(1);
    windowApi.runFrame(101);
    expect(onSizeUpdate).toHaveBeenCalledTimes(2);

    resizeObserverInstances[0].callback();
    windowApi.runFrame(102);
    expect(onSizeUpdate).toHaveBeenCalledTimes(3);

    resizeObserverInstances[0].callback();
    cleanup();
    expect(windowApi.cancelAnimationFrame).toHaveBeenCalledWith(103);
    expect(windowApi.clearTimeout).toHaveBeenCalledWith(1);
    expect(resizeObserverInstances[0].disconnect).toHaveBeenCalled();
  });
});
