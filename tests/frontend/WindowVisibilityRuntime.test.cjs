/** @jest-environment node */

const {
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
    webContents: {
      send: jest.fn(),
    },
  };
}

describe('window_visibility_runtime showChatWindow', () => {
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
