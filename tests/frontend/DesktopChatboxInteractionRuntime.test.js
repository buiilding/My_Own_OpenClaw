/**
 * Covers chatbox interaction runtime browser adapters.
 */

import { DesktopChatboxInteractionRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatboxInteractionRuntime';
import { DesktopWindowRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient';

jest.mock('../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient', () => ({
  DesktopWindowRuntimeClient: {
    setChatboxVisualAnchorHeightValue: jest.fn(() => Promise.resolve()),
  },
}));

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
  let nextTimeoutId = 1;
  let nextFrameId = 100;
  const timeouts = new Map();
  const frames = new Map();
  return {
    setTimeout: jest.fn((callback, delayMs) => {
      const id = nextTimeoutId;
      nextTimeoutId += 1;
      timeouts.set(id, { callback, delayMs });
      return id;
    }),
    clearTimeout: jest.fn((id) => {
      timeouts.delete(id);
    }),
    requestAnimationFrame: jest.fn((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: jest.fn((id) => {
      frames.delete(id);
    }),
    runTimeout(id) {
      timeouts.get(id)?.callback();
    },
    runFrame(id) {
      frames.get(id)?.(0);
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

describe('desktopChatboxInteractionRuntime', () => {
  beforeEach(() => {
    DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue.mockClear();
  });

  test('subscribes and cleans up chatbox drag window events', () => {
    const eventTarget = createEventTarget();
    const onDragMove = jest.fn();
    const onStopDragging = jest.fn();

    const cleanup = DesktopChatboxInteractionRuntime.subscribeToChatboxDragWindowEvents({
      eventTarget,
      onDragMove,
      onStopDragging,
    });

    eventTarget.dispatch('pointermove', { type: 'pointermove' });
    eventTarget.dispatch('mousemove', { type: 'mousemove' });
    eventTarget.dispatch('pointerup', { type: 'pointerup' });
    eventTarget.dispatch('mouseup', { type: 'mouseup' });
    eventTarget.dispatch('blur', { type: 'blur' });

    expect(onDragMove).toHaveBeenCalledTimes(2);
    expect(onStopDragging).toHaveBeenCalledTimes(3);

    cleanup();
    expect(eventTarget.listeners.size).toBe(0);
  });

  test('reports initial and resize-settled visual anchor height', () => {
    const shell = { offsetHeight: 90 };
    const windowApi = createWindowApi();
    const resizeObserverInstances = [];
    const ResizeObserverCtor = createResizeObserverCtor(resizeObserverInstances);

    const cleanup = DesktopChatboxInteractionRuntime.startChatboxVisualAnchorSync({
      hasImagePreview: false,
      resizeObserverCtor: ResizeObserverCtor,
      shellRef: { current: shell },
      windowApi,
    });

    expect(DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue)
      .toHaveBeenCalledWith(84, null);
    expect(resizeObserverInstances[0].observe).toHaveBeenCalledWith(shell);

    shell.offsetHeight = 96;
    resizeObserverInstances[0].callback();
    expect(windowApi.setTimeout).toHaveBeenCalledWith(expect.any(Function), 120);

    windowApi.runTimeout(1);
    expect(windowApi.requestAnimationFrame).toHaveBeenCalled();

    windowApi.runFrame(100);
    expect(DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue)
      .toHaveBeenLastCalledWith(90, null);

    cleanup();
    expect(resizeObserverInstances[0].disconnect).toHaveBeenCalled();
  });

  test('clears pending visual anchor timeout and animation frame on cleanup', () => {
    const shell = { offsetHeight: 90 };
    const windowApi = createWindowApi();
    const resizeObserverInstances = [];
    const ResizeObserverCtor = createResizeObserverCtor(resizeObserverInstances);

    const cleanup = DesktopChatboxInteractionRuntime.startChatboxVisualAnchorSync({
      hasImagePreview: false,
      resizeObserverCtor: ResizeObserverCtor,
      shellRef: { current: shell },
      windowApi,
    });

    shell.offsetHeight = 98;
    resizeObserverInstances[0].callback();
    windowApi.runTimeout(1);
    shell.offsetHeight = 100;
    resizeObserverInstances[0].callback();
    cleanup();

    expect(windowApi.clearTimeout).toHaveBeenCalledWith(2);
    expect(windowApi.cancelAnimationFrame).toHaveBeenCalledWith(100);
  });

  test('resets visual anchor height to the compact fallback', async () => {
    await DesktopChatboxInteractionRuntime.resetChatboxVisualAnchorHeight();

    expect(DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue)
      .toHaveBeenCalledWith(64);
  });
});
