/** @jest-environment node */

const {
  createOffscreenBounds,
  getWindowBounds,
  hideMainWindow,
  isMainWindowSuppressedForScreenshot,
  isWindowOffscreenForScreenshot,
  rememberWindowBoundsForScreenshotSuppression,
  resolveShowTargetDisplayAffinity,
  restoreWindowBoundsFromScreenshotSuppression,
  setWindowOpacityIfSupported,
  setWindowBounds,
  showMainWindow,
  showChatWindow,
  waitForMainWindowSuppressedForScreenshot,
} = require('../../frontend/src/main/window_visibility_runtime.cjs');

function createWindow({
  visible = false,
  destroyed = false,
} = {}) {
  return {
    isDestroyed: jest.fn(() => destroyed),
    isVisible: jest.fn(() => visible),
    show: jest.fn(),
    showInactive: jest.fn(),
    hide: jest.fn(),
    focus: jest.fn(),
    setOpacity: jest.fn(),
    minimize: jest.fn(),
    restore: jest.fn(),
    isMinimized: jest.fn(() => false),
    getBounds: jest.fn(() => ({ x: 100, y: 100, width: 600, height: 400 })),
    setBounds: jest.fn(),
    webContents: {
      send: jest.fn(),
    },
  };
}

describe('window_visibility_runtime showChatWindow', () => {
  test('resolveShowTargetDisplayAffinity prefers explicit target and otherwise uses stored affinity only for hidden windows', () => {
    const explicitTargetDisplayAffinity = { monitor_id: '3' };
    const hiddenWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
    };
    const visibleWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
    };
    const getActiveDisplayAffinity = jest.fn(() => ({ monitor_id: '2' }));

    expect(resolveShowTargetDisplayAffinity({
      targetDisplayAffinity: explicitTargetDisplayAffinity,
      targetWindow: hiddenWindow,
      getActiveDisplayAffinity,
    })).toEqual(explicitTargetDisplayAffinity);
    expect(resolveShowTargetDisplayAffinity({
      targetDisplayAffinity: null,
      targetWindow: hiddenWindow,
      getActiveDisplayAffinity,
    })).toEqual({ monitor_id: '2' });
    expect(resolveShowTargetDisplayAffinity({
      targetDisplayAffinity: null,
      targetWindow: visibleWindow,
      getActiveDisplayAffinity,
    })).toBeNull();
  });

  test('captures previous external focus even when focus is false', () => {
    const chatWindow = createWindow({ visible: false });
    const externalFocusTracker = {
      capturePreviousExternalFocusedWindow: jest.fn(),
    };

    const result = showChatWindow(
      { focus: false },
      {
        chatWindow,
        externalFocusTracker,
        syncWindowDisplayAffinity: jest.fn(),
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(externalFocusTracker.capturePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(chatWindow.showInactive).toHaveBeenCalledTimes(1);
    expect(chatWindow.show).not.toHaveBeenCalled();
    expect(chatWindow.focus).not.toHaveBeenCalled();
    expect(chatWindow.webContents.send).not.toHaveBeenCalled();
  });

  test('repositions chat window onto target display affinity before showing', () => {
    const chatWindow = createWindow({ visible: false });
    const positionChatWindow = jest.fn();
    const setActiveDisplayAffinity = jest.fn();
    const externalFocusTracker = {
      capturePreviousExternalFocusedWindow: jest.fn(),
    };

    const result = showChatWindow(
      {
        focus: true,
        targetDisplayAffinity: {
          monitor_id: '2',
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      },
      {
        chatWindow,
        externalFocusTracker,
        positionChatWindow,
        setActiveDisplayAffinity,
        syncWindowDisplayAffinity: jest.fn(),
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(setActiveDisplayAffinity).toHaveBeenCalledWith({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });
    expect(positionChatWindow).toHaveBeenCalledTimes(1);
    expect(chatWindow.show).toHaveBeenCalledTimes(1);
  });

  test('repositions hidden chat window onto stored active display affinity when no explicit target is provided', () => {
    const chatWindow = createWindow({ visible: false });
    const positionChatWindow = jest.fn();
    const setActiveDisplayAffinity = jest.fn();
    const getActiveDisplayAffinity = jest.fn(() => ({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    }));

    const result = showChatWindow(
      { focus: true },
      {
        chatWindow,
        positionChatWindow,
        setActiveDisplayAffinity,
        getActiveDisplayAffinity,
        syncWindowDisplayAffinity: jest.fn(),
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(setActiveDisplayAffinity).toHaveBeenCalledWith({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });
    expect(positionChatWindow).toHaveBeenCalledTimes(1);
    expect(chatWindow.show).toHaveBeenCalledTimes(1);
  });

  test('falls back to show when showInactive is unavailable', () => {
    const chatWindow = createWindow({ visible: false });
    chatWindow.showInactive = undefined;
    const syncWindowDisplayAffinity = jest.fn();
    const externalFocusTracker = {
      capturePreviousExternalFocusedWindow: jest.fn(),
    };

    const result = showChatWindow(
      { focus: false },
      {
        chatWindow,
        externalFocusTracker,
        syncWindowDisplayAffinity,
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(chatWindow.show).toHaveBeenCalledTimes(1);
    expect(syncWindowDisplayAffinity).toHaveBeenCalledWith(chatWindow);
    expect(chatWindow.focus).not.toHaveBeenCalled();
  });

  test('still focuses and emits chatbox-focus when focus is true', () => {
    const chatWindow = createWindow({ visible: true });
    const syncWindowDisplayAffinity = jest.fn();
    const externalFocusTracker = {
      capturePreviousExternalFocusedWindow: jest.fn(),
    };

    const result = showChatWindow(
      { focus: true },
      {
        chatWindow,
        externalFocusTracker,
        syncWindowDisplayAffinity,
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(externalFocusTracker.capturePreviousExternalFocusedWindow).toHaveBeenCalledTimes(1);
    expect(syncWindowDisplayAffinity).toHaveBeenCalledWith(chatWindow);
    expect(chatWindow.focus).toHaveBeenCalledTimes(1);
    expect(chatWindow.webContents.send).toHaveBeenCalledWith('chatbox-focus');
  });

  test('does not auto-restore response overlay on non-focusing show', () => {
    const chatWindow = createWindow({ visible: false });
    const responseWindow = createWindow({ visible: false });
    const showResponseWindowInactive = jest.fn();
    const ensureResponseOverlayFallbackBounds = jest.fn();
    const setResponseOverlayVisible = jest.fn();
    const syncWindowDisplayAffinity = jest.fn();

    const result = showChatWindow(
      { focus: false },
      {
        chatWindow,
        responseWindow,
        syncWindowDisplayAffinity,
        responseOverlayVisible: true,
        isResponseOverlayStreamingPhase: () => true,
        showResponseWindowInactive,
        ensureResponseOverlayFallbackBounds,
        setResponseOverlayVisible,
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(syncWindowDisplayAffinity).toHaveBeenCalledWith(chatWindow);
    expect(showResponseWindowInactive).not.toHaveBeenCalled();
    expect(ensureResponseOverlayFallbackBounds).not.toHaveBeenCalled();
    expect(setResponseOverlayVisible).not.toHaveBeenCalled();
  });

  test('restores response overlay on non-focusing screenshot restore when explicitly requested', () => {
    const chatWindow = createWindow({ visible: false });
    const responseWindow = createWindow({ visible: false });
    const showResponseWindowInactive = jest.fn();
    const ensureResponseOverlayFallbackBounds = jest.fn();
    const setResponseOverlayVisible = jest.fn();

    const result = showChatWindow(
      { focus: false, restoreResponseOverlay: true },
      {
        chatWindow,
        responseWindow,
        syncWindowDisplayAffinity: jest.fn(),
        responseOverlayVisible: true,
        isResponseOverlayStreamingPhase: () => true,
        showResponseWindowInactive,
        ensureResponseOverlayFallbackBounds,
        setResponseOverlayVisible,
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(showResponseWindowInactive).toHaveBeenCalledTimes(1);
    expect(ensureResponseOverlayFallbackBounds).toHaveBeenCalledTimes(1);
    expect(setResponseOverlayVisible).toHaveBeenCalledWith(true);
  });
});

describe('window_visibility_runtime showMainWindow', () => {
  test('repositions main window onto target display affinity before showing', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
    };
    const syncWindowDisplayAffinity = jest.fn();
    const setActiveDisplayAffinity = jest.fn();

    const result = showMainWindow(
      {
        focus: true,
        targetDisplayAffinity: {
          monitor_id: '2',
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      },
      { mainWindow, syncWindowDisplayAffinity, setActiveDisplayAffinity },
    );

    expect(result).toEqual({ success: true });
    expect(mainWindow.setOpacity).toHaveBeenCalledWith(1);
    expect(mainWindow.setBounds).toHaveBeenCalledWith({
      x: 2700,
      y: 350,
      width: 1000,
      height: 700,
    }, false);
    expect(setActiveDisplayAffinity).toHaveBeenCalledWith({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(syncWindowDisplayAffinity).toHaveBeenCalledWith(mainWindow);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
  });

  test('repositions hidden main window onto stored active display affinity when no explicit target is provided', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
    };
    const syncWindowDisplayAffinity = jest.fn();
    const setActiveDisplayAffinity = jest.fn();
    const getActiveDisplayAffinity = jest.fn(() => ({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    }));

    const result = showMainWindow(
      { focus: true },
      {
        mainWindow,
        syncWindowDisplayAffinity,
        setActiveDisplayAffinity,
        getActiveDisplayAffinity,
      },
    );

    expect(result).toEqual({ success: true });
    expect(mainWindow.setOpacity).toHaveBeenCalledWith(1);
    expect(mainWindow.setBounds).toHaveBeenCalledWith({
      x: 2700,
      y: 350,
      width: 1000,
      height: 700,
    }, false);
    expect(setActiveDisplayAffinity).toHaveBeenCalledWith({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(syncWindowDisplayAffinity).toHaveBeenCalledWith(mainWindow);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
  });

  test('uses target display work area instead of native maximize when opening from another monitor maximized', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      setBounds: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      isMinimized: jest.fn(() => false),
      maximize: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
    };
    const syncWindowDisplayAffinity = jest.fn();
    const setActiveDisplayAffinity = jest.fn();

    const result = showMainWindow(
      {
        focus: true,
        maximize: true,
        targetDisplayAffinity: {
          monitor_id: '2',
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      },
      { mainWindow, syncWindowDisplayAffinity, setActiveDisplayAffinity },
    );

    expect(result).toEqual({ success: true });
    expect(mainWindow.setOpacity).toHaveBeenCalledWith(1);
    expect(mainWindow.setBounds).toHaveBeenCalledWith({
      x: 1920,
      y: 0,
      width: 2560,
      height: 1400,
    }, false);
    expect(setActiveDisplayAffinity).toHaveBeenCalledWith({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });
    expect(mainWindow.maximize).not.toHaveBeenCalled();
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(syncWindowDisplayAffinity).toHaveBeenCalledWith(mainWindow);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
  });

  test('unmaximizes before repositioning onto target display', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
      isMaximized: jest.fn(() => true),
      unmaximize: jest.fn(),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
    };
    const syncWindowDisplayAffinity = jest.fn();
    const setActiveDisplayAffinity = jest.fn();

    showMainWindow(
      {
        focus: false,
        targetDisplayAffinity: {
          monitor_id: '2',
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      },
      { mainWindow, syncWindowDisplayAffinity, setActiveDisplayAffinity },
    );

    expect(mainWindow.unmaximize).toHaveBeenCalledTimes(1);
    expect(mainWindow.setOpacity).toHaveBeenCalledWith(1);
    expect(setActiveDisplayAffinity).toHaveBeenCalledWith({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });
    expect(mainWindow.show).not.toHaveBeenCalled();
    expect(syncWindowDisplayAffinity).toHaveBeenCalledWith(mainWindow);
    expect(mainWindow.focus).not.toHaveBeenCalled();
  });
});

describe('window_visibility_runtime hideMainWindow', () => {
  test('forces transparency before hiding a visible main window', () => {
    const mainWindow = createWindow({ visible: true });

    const resultPromise = hideMainWindow({}, { mainWindow });

    return expect(resultPromise).resolves.toEqual({
      success: true,
      suppressedForScreenshot: false,
      minimized: false,
    }).then(() => {
      expect(mainWindow.setOpacity).toHaveBeenCalledWith(0);
      expect(mainWindow.hide).toHaveBeenCalledTimes(1);
    });
  });

  test('does not throw when opacity control is unavailable', () => {
    const mainWindow = createWindow({ visible: true });
    delete mainWindow.setOpacity;

    const resultPromise = hideMainWindow({}, { mainWindow });

    return expect(resultPromise).resolves.toEqual({
      success: true,
      suppressedForScreenshot: false,
      minimized: false,
    }).then(() => {
      expect(mainWindow.hide).toHaveBeenCalledTimes(1);
    });
  });

  test('minimizes and waits for dashboard suppression during screenshot prep', async () => {
    const mainWindow = createWindow({ visible: true });
    mainWindow.isVisible
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    const waitInMain = jest.fn().mockResolvedValue(undefined);

    const result = await hideMainWindow(
      { suppressForScreenshot: true },
      { mainWindow, waitInMain },
    );

    expect(result).toEqual({
      success: true,
      suppressedForScreenshot: true,
      minimized: false,
    });
    expect(mainWindow.setOpacity).toHaveBeenCalledWith(0);
    expect(mainWindow.setBounds).toHaveBeenCalledWith({
      x: -50600,
      y: -50400,
      width: 600,
      height: 400,
    }, false);
    expect(mainWindow.hide).toHaveBeenCalledTimes(1);
  });
});

describe('window_visibility_runtime screenshot suppression helpers', () => {
  test('creates deterministic offscreen bounds', () => {
    expect(createOffscreenBounds({
      x: 100,
      y: 100,
      width: 600,
      height: 400,
    })).toEqual({
      x: -50600,
      y: -50400,
      width: 600,
      height: 400,
    });
  });

  test('gets and sets bounds only when supported', () => {
    const mainWindow = createWindow({ visible: true });
    expect(getWindowBounds(mainWindow)).toEqual({ x: 100, y: 100, width: 600, height: 400 });
    expect(setWindowBounds(mainWindow, { x: 1, y: 2, width: 3, height: 4 })).toBe(true);
    expect(mainWindow.setBounds).toHaveBeenCalledWith({ x: 1, y: 2, width: 3, height: 4 }, false);
    expect(getWindowBounds({})).toBeNull();
    expect(setWindowBounds({}, { x: 0, y: 0, width: 1, height: 1 })).toBe(false);
  });

  test('stores and restores pre-suppression bounds', () => {
    const mainWindow = createWindow({ visible: true });
    expect(rememberWindowBoundsForScreenshotSuppression(mainWindow)).toBeUndefined();
    mainWindow.getBounds.mockReturnValue({ x: 320, y: 240, width: 900, height: 700 });
    const restored = restoreWindowBoundsFromScreenshotSuppression(mainWindow);
    expect(restored).toBe(true);
    expect(mainWindow.setBounds).toHaveBeenCalledWith({ x: 100, y: 100, width: 600, height: 400 }, false);
  });

  test('recognizes minimized or hidden windows as suppressed', () => {
    expect(isMainWindowSuppressedForScreenshot({
      isMinimized: () => true,
      isVisible: () => true,
      getBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    })).toBe(true);
    expect(isMainWindowSuppressedForScreenshot({
      isMinimized: () => false,
      isVisible: () => false,
      getBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    })).toBe(true);
    expect(isMainWindowSuppressedForScreenshot({
      isMinimized: () => false,
      isVisible: () => true,
      getBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    })).toBe(false);
  });

  test('recognizes offscreen windows as suppressed', () => {
    expect(isWindowOffscreenForScreenshot({
      getBounds: () => ({ x: -60000, y: -60000, width: 600, height: 400 }),
    })).toBe(true);
    expect(isMainWindowSuppressedForScreenshot({
      isMinimized: () => false,
      isVisible: () => true,
      getBounds: () => ({ x: -60000, y: -60000, width: 600, height: 400 }),
    })).toBe(true);
  });

  test('waits until suppression predicate becomes true', async () => {
    const mainWindow = {
      isMinimized: jest.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValue(true),
      isVisible: jest.fn(() => true),
      getBounds: jest.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
    };
    const waitInMain = jest.fn().mockResolvedValue(undefined);

    await expect(waitForMainWindowSuppressedForScreenshot(mainWindow, {
      waitInMain,
      timeoutMs: 100,
      pollMs: 10,
    })).resolves.toBe(true);
    expect(waitInMain).toHaveBeenCalled();
  });
});

describe('window_visibility_runtime setWindowOpacityIfSupported', () => {
  test('noops for missing windows and missing opacity support', () => {
    expect(() => setWindowOpacityIfSupported(null, 0)).not.toThrow();
    expect(() => setWindowOpacityIfSupported({}, 0)).not.toThrow();
  });
});
