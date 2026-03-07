/** @jest-environment node */

const {
  hideMainWindow,
  resolveShowTargetDisplayAffinity,
  setWindowOpacityIfSupported,
  showMainWindow,
  showChatWindow,
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

    const result = hideMainWindow({ mainWindow });

    expect(result).toEqual({ success: true });
    expect(mainWindow.setOpacity).toHaveBeenCalledWith(0);
    expect(mainWindow.hide).toHaveBeenCalledTimes(1);
  });

  test('does not throw when opacity control is unavailable', () => {
    const mainWindow = createWindow({ visible: true });
    delete mainWindow.setOpacity;

    const result = hideMainWindow({ mainWindow });

    expect(result).toEqual({ success: true });
    expect(mainWindow.hide).toHaveBeenCalledTimes(1);
  });
});

describe('window_visibility_runtime setWindowOpacityIfSupported', () => {
  test('noops for missing windows and missing opacity support', () => {
    expect(() => setWindowOpacityIfSupported(null, 0)).not.toThrow();
    expect(() => setWindowOpacityIfSupported({}, 0)).not.toThrow();
  });
});
