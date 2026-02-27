/** @jest-environment node */

jest.mock('electron', () => ({
  nativeImage: {
    createFromDataURL: jest.fn(() => ({ isEmpty: () => false })),
  },
}));

const {
  createMainWindow,
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
      canTrackExternalFocus: jest.fn().mockReturnValue(true),
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
    expect(externalFocusTracker.canTrackExternalFocus).toHaveBeenCalledTimes(1);
    expect(externalFocusTracker.restorePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      restoredExternalFocus: true,
      externalFocusActive: true,
      canVerifyExternalFocus: true,
    });
  });

  test('returns inactive verification result when restored app is not active', async () => {
    const externalFocusTracker = {
      canTrackExternalFocus: jest.fn().mockReturnValue(true),
      restorePreviousExternalFocusedWindow: jest.fn().mockReturnValue(true),
      isPreviousExternalFocusedWindowActive: jest.fn().mockReturnValue(false),
    };

    const result = await prepareOverlayQueryCaptureFocus({
      externalFocusTracker,
      waitMs: 0,
    });

    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      restoredExternalFocus: true,
      externalFocusActive: false,
      canVerifyExternalFocus: true,
    });
  });

  test('skips active-window verification when external focus cannot be restored', async () => {
    const externalFocusTracker = {
      canTrackExternalFocus: jest.fn().mockReturnValue(true),
      restorePreviousExternalFocusedWindow: jest.fn().mockReturnValue(false),
      isPreviousExternalFocusedWindowActive: jest.fn().mockReturnValue(true),
    };

    const result = await prepareOverlayQueryCaptureFocus({
      externalFocusTracker,
      waitMs: 0,
    });

    expect(externalFocusTracker.restorePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).not.toHaveBeenCalled();
    expect(result).toEqual({
      restoredExternalFocus: false,
      externalFocusActive: false,
      canVerifyExternalFocus: true,
    });
  });

  test('reports focus verification unavailable when platform tracking is disabled', async () => {
    const externalFocusTracker = {
      canTrackExternalFocus: jest.fn().mockReturnValue(false),
      restorePreviousExternalFocusedWindow: jest.fn(),
      isPreviousExternalFocusedWindowActive: jest.fn(),
    };

    const result = await prepareOverlayQueryCaptureFocus({
      externalFocusTracker,
      waitMs: 0,
    });

    expect(externalFocusTracker.restorePreviousExternalFocusedWindow).not.toHaveBeenCalled();
    expect(externalFocusTracker.isPreviousExternalFocusedWindowActive).not.toHaveBeenCalled();
    expect(result).toEqual({
      restoredExternalFocus: false,
      externalFocusActive: false,
      canVerifyExternalFocus: false,
    });
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

  test('disables chat overlay devtools in customer mode', () => {
    const { deps } = createDeps({ enableDevTransparencyUi: false });

    createChatWindow(deps);

    const options = deps.BrowserWindow.mock.calls[0][0];
    expect(options.webPreferences.devTools).toBe(false);
  });

  test('enables chat overlay devtools in dev mode', () => {
    const { deps } = createDeps({ enableDevTransparencyUi: true });

    createChatWindow(deps);

    const options = deps.BrowserWindow.mock.calls[0][0];
    expect(options.webPreferences.devTools).toBe(true);
  });

  test('uses fixed chat overlay dimensions to avoid runtime resize flicker', () => {
    const { deps } = createDeps();

    createChatWindow(deps);

    const options = deps.BrowserWindow.mock.calls[0][0];
    expect(options.width).toBe(520);
    expect(options.height).toBe(116);
    expect(options.resizable).toBe(false);
  });
});

describe('main_window_runtime createMainWindow', () => {
  function createDeps(overrides = {}) {
    const handlers = {};
    const mainWindow = {
      setContentProtection: jest.fn(),
      setMenuBarVisibility: jest.fn(),
      loadURL: jest.fn(),
      loadFile: jest.fn(),
      hide: jest.fn(),
      on: jest.fn((eventName, handler) => {
        handlers[eventName] = handler;
      }),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        send: jest.fn(),
        isDestroyed: jest.fn().mockReturnValue(false),
      },
    };
    const BrowserWindow = jest.fn(() => mainWindow);
    const deps = {
      BrowserWindow,
      path: require('path'),
      app: { isPackaged: false, isQuitting: false },
      platform: 'linux',
      enableDevTransparencyUi: false,
      initializeIpc: jest.fn(),
      handleResponseOverlayPhaseChange: jest.fn(),
      prepareOverlayQueryCaptureFocus: jest.fn(),
      initializeWakewordBridge: jest.fn(),
      showChatWindow: jest.fn().mockReturnValue({ success: true }),
      emitWakewordSttTrigger: jest.fn(),
      initializeLocalBackendBridge: jest.fn(),
      initializeOverlayHandlers: jest.fn(),
      getLatestFrontendConfig: jest.fn(),
      getWindows: jest.fn(() => ({ mainWindow })),
      setMainWindow: jest.fn(),
      enableContentProtectionSafely: jest.fn(),
      ...overrides,
    };
    return { deps, BrowserWindow, mainWindow, handlers };
  }

  test('disables dashboard devtools in customer mode', () => {
    const { deps, BrowserWindow } = createDeps({ enableDevTransparencyUi: false });

    createMainWindow(deps);

    const options = BrowserWindow.mock.calls[0][0];
    expect(options.webPreferences.devTools).toBe(false);
  });

  test('enables dashboard devtools in dev mode', () => {
    const { deps, BrowserWindow } = createDeps({ enableDevTransparencyUi: true });

    createMainWindow(deps);

    const options = BrowserWindow.mock.calls[0][0];
    expect(options.webPreferences.devTools).toBe(true);
  });
});
