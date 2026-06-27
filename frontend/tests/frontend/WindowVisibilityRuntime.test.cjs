/** @jest-environment node */

const {
  hideChatWindow,
  hideMainWindow,
  showMainWindow,
  showChatWindow,
} = require('../../src/main/surfaces/window_visibility_runtime.cjs');

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
    moveTop: jest.fn(),
    setOpacity: jest.fn(),
    minimize: jest.fn(),
    restore: jest.fn(),
    isMinimized: jest.fn(() => false),
    getBounds: jest.fn(() => ({ x: 100, y: 100, width: 600, height: 400 })),
    setBounds: jest.fn(),
    webContents: {
      focus: jest.fn(),
      send: jest.fn(),
    },
  };
}

describe('window_visibility_runtime showChatWindow', () => {
  test('uses a non-focusing show when focus is false', () => {
    const chatWindow = createWindow({ visible: false });

    const result = showChatWindow(
      { focus: false },
      {
        chatWindow,
        syncWindowDisplayAffinity: jest.fn(),
        syncChatboxHitTestState: jest.fn(),
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(chatWindow.showInactive).toHaveBeenCalledTimes(1);
    expect(chatWindow.show).not.toHaveBeenCalled();
    expect(chatWindow.focus).not.toHaveBeenCalled();
    expect(chatWindow.webContents.send).not.toHaveBeenCalled();
  });

  test('repositions chat window onto target display affinity before showing', () => {
    const chatWindow = createWindow({ visible: false });
    const positionChatWindow = jest.fn();
    const setActiveDisplayAffinity = jest.fn();
    const syncChatboxHitTestState = jest.fn();

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
        positionChatWindow,
        setActiveDisplayAffinity,
        syncChatboxHitTestState,
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
    expect(syncChatboxHitTestState).toHaveBeenCalledTimes(1);
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

    const result = showChatWindow(
      { focus: false },
      {
        chatWindow,
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

    const result = showChatWindow(
      { focus: true },
      {
        chatWindow,
        syncWindowDisplayAffinity,
        syncWakewordToggleForChatVisibility: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
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
  test('hides any visible overlay surface before showing the dashboard', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      moveTop: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
      webContents: {
        focus: jest.fn(),
        invalidate: jest.fn(),
      },
    };
    const responseWindow = createWindow({ visible: true });
    const hideChatWindow = jest.fn();

    const result = showMainWindow(
      { focus: true },
      {
        mainWindow,
        chatWindow: createWindow({ visible: false }),
        responseWindow,
        hideChatWindow,
        syncWindowDisplayAffinity: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(hideChatWindow).toHaveBeenCalledWith({ reason: 'surface-handoff:show-main-window' });
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
  });

  test('repositions main window onto target display affinity before showing', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      moveTop: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
      webContents: {
        focus: jest.fn(),
        invalidate: jest.fn(),
      },
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
    expect(mainWindow.moveTop).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.focus).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.invalidate.mock.calls).toHaveLength(1);
  });

  test('repositions hidden main window onto stored active display affinity when no explicit target is provided', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      moveTop: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
      webContents: {
        focus: jest.fn(),
        invalidate: jest.fn(),
      },
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
    expect(mainWindow.moveTop).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.focus).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.invalidate.mock.calls).toHaveLength(1);
  });

  test('restores screenshot-suppressed bounds before implicit display affinity', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      moveTop: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
      __desktopRuntimeScreenshotRestoreBounds: {
        x: 123,
        y: 234,
        width: 900,
        height: 640,
      },
      webContents: {
        focus: jest.fn(),
        invalidate: jest.fn(),
      },
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
    expect(mainWindow.setBounds).toHaveBeenCalledWith({
      x: 123,
      y: 234,
      width: 900,
      height: 640,
    }, false);
    expect(getActiveDisplayAffinity).not.toHaveBeenCalled();
    expect(setActiveDisplayAffinity).not.toHaveBeenCalled();
    expect(mainWindow.getSize).not.toHaveBeenCalled();
    expect(mainWindow.__desktopRuntimeScreenshotRestoreBounds).toBeUndefined();
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(syncWindowDisplayAffinity).toHaveBeenCalledWith(mainWindow);
  });

  test('explicit target display affinity overrides screenshot restore bounds', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      moveTop: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
      __desktopRuntimeScreenshotRestoreBounds: {
        x: 123,
        y: 234,
        width: 900,
        height: 640,
      },
      webContents: {
        focus: jest.fn(),
        invalidate: jest.fn(),
      },
    };
    const targetDisplayAffinity = {
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    };
    const setActiveDisplayAffinity = jest.fn();

    const result = showMainWindow(
      { focus: true, targetDisplayAffinity },
      {
        mainWindow,
        syncWindowDisplayAffinity: jest.fn(),
        setActiveDisplayAffinity,
      },
    );

    expect(result).toEqual({ success: true });
    expect(setActiveDisplayAffinity).toHaveBeenCalledWith(targetDisplayAffinity);
    expect(mainWindow.setBounds).toHaveBeenCalledWith({
      x: 2700,
      y: 350,
      width: 1000,
      height: 700,
    }, false);
    expect(mainWindow.__desktopRuntimeScreenshotRestoreBounds).toBeUndefined();
  });

  test('uses target display work area instead of native maximize when opening from another monitor maximized', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      isFullScreen: jest.fn(() => false),
      setFullScreen: jest.fn(),
      setBounds: jest.fn(),
      show: jest.fn(),
      moveTop: jest.fn(),
      focus: jest.fn(),
      isMinimized: jest.fn(() => false),
      maximize: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      webContents: {
        focus: jest.fn(),
      },
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
    expect(mainWindow.setFullScreen).not.toHaveBeenCalled();
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(syncWindowDisplayAffinity).toHaveBeenCalledWith(mainWindow);
    expect(mainWindow.moveTop).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.focus).toHaveBeenCalledTimes(1);
  });

  test('unmaximizes before repositioning onto target display', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
      isMaximized: jest.fn(() => true),
      isFullScreen: jest.fn(() => false),
      setFullScreen: jest.fn(),
      unmaximize: jest.fn(),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      moveTop: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
      webContents: {
        focus: jest.fn(),
      },
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
    expect(mainWindow.moveTop).not.toHaveBeenCalled();
    expect(mainWindow.focus).not.toHaveBeenCalled();
    expect(mainWindow.webContents.focus).not.toHaveBeenCalled();
  });

  test('exits macOS fullscreen before repositioning onto target display', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
      isMaximized: jest.fn(() => false),
      isFullScreen: jest.fn(() => true),
      setFullScreen: jest.fn(),
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
      show: jest.fn(),
      moveTop: jest.fn(),
      focus: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      isMinimized: jest.fn(() => false),
      webContents: {
        focus: jest.fn(),
      },
    };

    showMainWindow(
      {
        focus: false,
        targetDisplayAffinity: {
          monitor_id: '2',
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      },
      {
        mainWindow,
        platform: 'darwin',
        syncWindowDisplayAffinity: jest.fn(),
        setActiveDisplayAffinity: jest.fn(),
      },
    );

    expect(mainWindow.setFullScreen).toHaveBeenCalledWith(false);
  });

  test('uses macOS fullscreen when opening maximized without a target display', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      isMaximized: jest.fn(() => false),
      isFullScreen: jest.fn(() => false),
      setFullScreen: jest.fn(),
      setBounds: jest.fn(),
      show: jest.fn(),
      moveTop: jest.fn(),
      focus: jest.fn(),
      isMinimized: jest.fn(() => false),
      maximize: jest.fn(),
      setOpacity: jest.fn(),
      restore: jest.fn(),
      webContents: {
        focus: jest.fn(),
        invalidate: jest.fn(),
      },
    };

    const result = showMainWindow(
      { focus: true, maximize: true },
      {
        mainWindow,
        platform: 'darwin',
        syncWindowDisplayAffinity: jest.fn(),
      },
    );

    expect(result).toEqual({ success: true });
    expect(mainWindow.setFullScreen).toHaveBeenCalledWith(true);
    expect(mainWindow.maximize).not.toHaveBeenCalled();
  });
});

describe('window_visibility_runtime hideChatWindow', () => {
  test('hides response-only overlay surfaces even when the chat window is unavailable', () => {
    const responseWindow = createWindow({ visible: true });
    const broadcastResponseOverlayVisibility = jest.fn();
    const syncWakewordToggleForChatVisibility = jest.fn();

    const result = hideChatWindow({
      chatWindow: null,
      responseWindow,
      broadcastResponseOverlayVisibility,
      syncWakewordToggleForChatVisibility,
    });

    expect(result).toEqual({ success: true });
    expect(responseWindow.hide).toHaveBeenCalledTimes(1);
    expect(broadcastResponseOverlayVisibility).toHaveBeenCalledWith(false);
    expect(syncWakewordToggleForChatVisibility).toHaveBeenCalledTimes(1);
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
