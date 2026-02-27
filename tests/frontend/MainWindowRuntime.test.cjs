/** @jest-environment node */

const {
  createChatWindow,
  prepareOverlayQueryCaptureFocus,
} = require('../../frontend/src/main/main_window_runtime.cjs');

describe('main_window_runtime prepareOverlayQueryCaptureFocus', () => {
  function createFocusableWindow() {
    return {
      isDestroyed: jest.fn().mockReturnValue(false),
      blur: jest.fn(),
    };
  }

  test('blurs assistant windows and verifies restored external focus before return', async () => {
    const chatWindow = createFocusableWindow();
    const mainWindow = createFocusableWindow();
    const externalFocusTracker = {
      restorePreviousExternalFocusedWindow: jest.fn().mockReturnValue(true),
      isPreviousExternalFocusedWindowActive: jest.fn().mockReturnValue(true),
    };

    const result = await prepareOverlayQueryCaptureFocus({
      chatWindow,
      mainWindow,
      externalFocusTracker,
      waitMs: 0,
    });

    expect(chatWindow.blur).toHaveBeenCalledTimes(1);
    expect(mainWindow.blur).toHaveBeenCalledTimes(1);
    expect(externalFocusTracker.restorePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ restoredExternalFocus: true, externalFocusActive: true });
  });

  test('returns inactive verification result when restored app is not active', async () => {
    const externalFocusTracker = {
      restorePreviousExternalFocusedWindow: jest.fn().mockReturnValue(true),
      isPreviousExternalFocusedWindowActive: jest.fn().mockReturnValue(false),
    };

    const result = await prepareOverlayQueryCaptureFocus({
      externalFocusTracker,
      waitMs: 0,
    });

    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ restoredExternalFocus: true, externalFocusActive: false });
  });

  test('skips active-window verification when external focus cannot be restored', async () => {
    const externalFocusTracker = {
      restorePreviousExternalFocusedWindow: jest.fn().mockReturnValue(false),
      isPreviousExternalFocusedWindowActive: jest.fn().mockReturnValue(true),
    };

    const result = await prepareOverlayQueryCaptureFocus({
      externalFocusTracker,
      waitMs: 0,
    });

    expect(externalFocusTracker.restorePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).not.toHaveBeenCalled();
    expect(result).toEqual({ restoredExternalFocus: false, externalFocusActive: false });
  });
});

describe('main_window_runtime createChatWindow', () => {
  function createDeps(overrides = {}) {
    const handlers = {};
    const chatWindow = {
      setAlwaysOnTop: jest.fn(),
      setVisibleOnAllWorkspaces: jest.fn(),
      setIgnoreMouseEvents: jest.fn(),
      setContentProtection: jest.fn(),
      loadURL: jest.fn(),
      loadFile: jest.fn(),
      on: jest.fn((eventName, handler) => {
        handlers[eventName] = handler;
      }),
      isDestroyed: jest.fn().mockReturnValue(false),
    };
    const BrowserWindow = jest.fn(() => chatWindow);
    const deps = {
      BrowserWindow,
      path: require('path'),
      app: { isPackaged: false, isQuitting: false },
      platform: 'linux',
      enableDevTransparencyUi: false,
      positionChatWindow: jest.fn(),
      hideChatWindow: jest.fn(),
      syncWakewordToggleForChatVisibility: jest.fn(),
      externalFocusTracker: {
        capturePreviousExternalFocusedWindow: jest.fn(),
      },
      setChatWindow: jest.fn(),
      enableContentProtectionSafely: jest.fn(),
      ...overrides,
    };
    return { deps, handlers, chatWindow };
  }

  test('captures external focus after chat window blur', () => {
    jest.useFakeTimers();
    try {
      const { deps, handlers } = createDeps();
      const capturePreviousExternalFocusedWindow = deps.externalFocusTracker.capturePreviousExternalFocusedWindow;

      createChatWindow(deps);
      expect(typeof handlers.blur).toBe('function');

      handlers.blur();
      expect(capturePreviousExternalFocusedWindow).not.toHaveBeenCalled();

      jest.advanceTimersByTime(30);
      expect(capturePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
