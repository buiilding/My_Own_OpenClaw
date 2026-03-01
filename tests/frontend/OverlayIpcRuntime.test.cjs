/** @jest-environment node */

const {
  initializeOverlayHandlersRuntime,
} = require('../../frontend/src/main/overlay_ipc_runtime.cjs');

describe('overlay_ipc_runtime prepare-overlay-tool-focus handler', () => {
  function createRuntime(overrides = {}) {
    const invokeHandlers = {};
    const eventHandlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        invokeHandlers[channel] = handler;
      }),
      on: jest.fn((channel, handler) => {
        eventHandlers[channel] = handler;
      }),
    };

    initializeOverlayHandlersRuntime({
      ipcMain,
      screen: {},
      shell: {},
      systemPreferences: {},
      platform: 'win32',
      getWindows: () => ({}),
      getChatWindowBounds: jest.fn(),
      positionResponseWindow: jest.fn(),
      positionContextLabelWindow: jest.fn(),
      syncContextLabelWindowVisibility: jest.fn(),
      getResponseWindowBounds: jest.fn(),
      setResponseOverlayVisibilityState: jest.fn(),
      showResponseWindowWhenChatVisible: jest.fn(),
      showMainWindow: jest.fn(),
      showChatWindow: jest.fn(),
      hideChatWindow: jest.fn(),
      normalizeMainWindowOpenTarget: jest.fn(),
      emitMainWindowOpenTarget: jest.fn(),
      warn: jest.fn(),
      ...overrides,
    });

    return {
      invokeHandlers,
      eventHandlers,
    };
  }

  test('forwards waitMs to overlay focus preparation and returns payload', async () => {
    const prepareOverlayToolFocus = jest.fn().mockResolvedValue({
      restoredExternalFocus: true,
      externalFocusActive: true,
    });
    const { invokeHandlers } = createRuntime({ prepareOverlayToolFocus });

    const result = await invokeHandlers['prepare-overlay-tool-focus'](null, { waitMs: 260 });

    expect(prepareOverlayToolFocus).toHaveBeenCalledWith({ waitMs: 260, skipDemotion: false });
    expect(result).toEqual({
      success: true,
      data: {
        restoredExternalFocus: true,
        externalFocusActive: true,
      },
    });
  });

  test('uses default wait duration when none is provided', async () => {
    const prepareOverlayToolFocus = jest.fn().mockResolvedValue(null);
    const { invokeHandlers } = createRuntime({ prepareOverlayToolFocus });

    await invokeHandlers['prepare-overlay-tool-focus'](null, {});

    expect(prepareOverlayToolFocus).toHaveBeenCalledWith({ waitMs: 180, skipDemotion: false });
  });

  test('forwards skipDemotion flag to overlay focus preparation', async () => {
    const prepareOverlayToolFocus = jest.fn().mockResolvedValue(null);
    const { invokeHandlers } = createRuntime({ prepareOverlayToolFocus });

    await invokeHandlers['prepare-overlay-tool-focus'](null, {
      waitMs: 90,
      skipDemotion: true,
    });

    expect(prepareOverlayToolFocus).toHaveBeenCalledWith({ waitMs: 90, skipDemotion: true });
  });

  test('returns unavailable error when focus preparation is not wired', async () => {
    const { invokeHandlers } = createRuntime({ prepareOverlayToolFocus: undefined });

    const result = await invokeHandlers['prepare-overlay-tool-focus'](null, {});

    expect(result).toEqual({ success: false, reason: 'Overlay focus preparation unavailable' });
  });

  test('returns failure when focus preparation throws', async () => {
    const prepareOverlayToolFocus = jest.fn().mockRejectedValue(new Error('focus boom'));
    const { invokeHandlers } = createRuntime({ prepareOverlayToolFocus });

    const result = await invokeHandlers['prepare-overlay-tool-focus'](null, { waitMs: 10 });

    expect(result).toEqual({
      success: false,
      reason: 'Failed to prepare overlay tool focus: focus boom',
    });
  });

  test('does not register deprecated chatbox resize invoke channel', () => {
    const { invokeHandlers } = createRuntime();

    expect(invokeHandlers['set-chatbox-size']).toBeUndefined();
    expect(typeof invokeHandlers['set-responsebox-size']).toBe('function');
    expect(typeof invokeHandlers['set-chatbox-visual-anchor-height']).toBe('function');
  });

  test('routes chatbox visual anchor updates to positioning runtime', async () => {
    const positionResponseWindow = jest.fn();
    const positionContextLabelWindow = jest.fn();
    const syncContextLabelWindowVisibility = jest.fn();
    const setChatVisualAnchorHeight = jest.fn(() => true);
    const { invokeHandlers } = createRuntime({
      positionResponseWindow,
      positionContextLabelWindow,
      syncContextLabelWindowVisibility,
      setChatVisualAnchorHeight,
    });

    const result = await invokeHandlers['set-chatbox-visual-anchor-height'](null, { height: 116 });

    expect(result).toEqual({
      success: true,
      height: 116,
      changed: true,
    });
    expect(setChatVisualAnchorHeight).toHaveBeenCalledWith(116);
    expect(positionResponseWindow).toHaveBeenCalledTimes(1);
    expect(positionContextLabelWindow).toHaveBeenCalledTimes(1);
    expect(syncContextLabelWindowVisibility).toHaveBeenCalledTimes(1);
  });

  test('reports main window visibility through get-main-window-visibility handler', async () => {
    const visibleMainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
    };
    const { invokeHandlers } = createRuntime({
      getWindows: () => ({ mainWindow: visibleMainWindow }),
    });

    const result = await invokeHandlers['get-main-window-visibility']();

    expect(result).toEqual({
      success: true,
      data: { visible: true },
    });
  });

  test('registers and handles set-overlay-focusable invoke channel', async () => {
    const windows = {
      chatWindow: {
        isDestroyed: jest.fn(() => false),
        setFocusable: jest.fn(),
      },
      responseWindow: {
        isDestroyed: jest.fn(() => false),
        setFocusable: jest.fn(),
      },
      contextLabelWindow: {
        isDestroyed: jest.fn(() => false),
        setFocusable: jest.fn(),
      },
    };
    const { invokeHandlers } = createRuntime({
      getWindows: () => windows,
    });

    const result = await invokeHandlers['set-overlay-focusable'](null, { focusable: false });

    expect(result).toEqual({ success: true });
    expect(windows.chatWindow.setFocusable).toHaveBeenCalledWith(false);
    expect(windows.responseWindow.setFocusable).toHaveBeenCalledWith(false);
    expect(windows.contextLabelWindow.setFocusable).toHaveBeenCalledWith(false);
  });
});
