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
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
    runTimeout(id) {
      timeouts.get(id)?.callback();
    },
    runFrame(id) {
      frames.get(id)?.(0);
    },
    frames,
    listeners,
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

function createPill(bounds, options = {}) {
  return {
    offsetWidth: options.offsetWidth ?? bounds?.width ?? 0,
    style: {
      setProperty: jest.fn(),
    },
    getBoundingClientRect: jest.fn(() => bounds),
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

  test('reports chatbox hit-test state from pointer bounds and blur', () => {
    const eventTarget = createEventTarget();
    const onHitTestActiveChange = jest.fn();
    const onTextEntryBlur = jest.fn();
    const pill = createPill({
      bottom: 120,
      left: 10,
      right: 410,
      top: 20,
    });

    const cleanup = DesktopChatboxInteractionRuntime.subscribeToChatboxHitTestEvents({
      eventTarget,
      onHitTestActiveChange,
      onTextEntryBlur,
      pillRef: { current: pill },
    });

    eventTarget.dispatch('mousemove', { clientX: 220, clientY: 60 });
    eventTarget.dispatch('mousemove', { clientX: 220, clientY: 10 });
    eventTarget.dispatch('mouseleave');
    eventTarget.dispatch('blur');

    expect(onHitTestActiveChange).toHaveBeenNthCalledWith(1, true);
    expect(onHitTestActiveChange).toHaveBeenNthCalledWith(2, false);
    expect(onHitTestActiveChange).toHaveBeenNthCalledWith(3, false);
    expect(onHitTestActiveChange).toHaveBeenNthCalledWith(4, false);
    expect(onTextEntryBlur).toHaveBeenCalledTimes(1);

    cleanup();
    expect(eventTarget.listeners.size).toBe(0);
  });

  test('treats missing chatbox bounds or invalid pointer coordinates as inactive', () => {
    expect(DesktopChatboxInteractionRuntime.isPointerInsideChatbox({
      event: { clientX: 20, clientY: 20 },
      pillRef: { current: null },
    })).toBe(false);

    expect(DesktopChatboxInteractionRuntime.isPointerInsideChatbox({
      event: { clientX: 'x', clientY: 20 },
      pillRef: {
        current: createPill({
          bottom: 20,
          left: 0,
          right: 20,
          top: 0,
        }),
      },
    })).toBe(false);
  });

  test('syncs close button anchor through resize and observer browser adapters', () => {
    const windowApi = createWindowApi();
    const resizeObserverInstances = [];
    const ResizeObserverCtor = createResizeObserverCtor(resizeObserverInstances);
    const snapshotRef = { current: { centerX: null } };
    const pill = createPill({
      left: 10,
      width: 520,
    }, { offsetWidth: 520 });
    let sendBounds = {
      left: 450,
      width: 40,
    };
    const sendButton = {
      getBoundingClientRect: jest.fn(() => sendBounds),
    };

    const cleanup = DesktopChatboxInteractionRuntime.startChatboxCloseButtonAnchorSync({
      pillRef: { current: pill },
      resizeObserverCtor: ResizeObserverCtor,
      sendButtonRef: { current: sendButton },
      snapshotRef,
      windowApi,
    });

    expect(windowApi.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(resizeObserverInstances[0].observe).toHaveBeenCalledWith(pill);
    windowApi.runFrame(100);
    expect(pill.style.setProperty).toHaveBeenCalledWith('--chatbox-close-center-x', '460px');
    expect(snapshotRef.current.centerX).toBe(460);

    windowApi.dispatch('resize');
    windowApi.runFrame(101);
    expect(pill.style.setProperty).toHaveBeenCalledTimes(1);

    sendBounds = {
      left: 430,
      width: 40,
    };
    resizeObserverInstances[0].callback();
    windowApi.runFrame(102);
    expect(pill.style.setProperty).toHaveBeenLastCalledWith('--chatbox-close-center-x', '440px');

    cleanup();
    expect(windowApi.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(resizeObserverInstances[0].disconnect).toHaveBeenCalled();
    expect(windowApi.listeners.size).toBe(0);
  });

  test('ignores invalid close button anchor measurements', () => {
    const pill = createPill({
      left: 10,
      width: 0,
    }, { offsetWidth: 0 });
    const sendButton = {
      getBoundingClientRect: jest.fn(() => ({
        left: 450,
        width: 40,
      })),
    };

    expect(DesktopChatboxInteractionRuntime.resolveChatboxCloseButtonAnchorCenterX({
      pillRef: { current: pill },
      sendButtonRef: { current: sendButton },
    })).toBeNull();
    expect(pill.style.setProperty).not.toHaveBeenCalled();
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
