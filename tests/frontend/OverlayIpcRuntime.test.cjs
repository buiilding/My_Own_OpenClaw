/** @jest-environment node */

const {
  initializeOverlayHandlersRuntime,
} = require('../../frontend/src/main/overlay_ipc_runtime.cjs');

describe('overlay_ipc_runtime', () => {
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

  test('does not register deprecated overlay interactivity/focus-prep invoke channels', () => {
    const { invokeHandlers } = createRuntime();

    expect(invokeHandlers['set-overlay-ignore-mouse']).toBeUndefined();
    expect(invokeHandlers['set-overlay-focusable']).toBeUndefined();
    expect(invokeHandlers['prepare-overlay-tool-focus']).toBeUndefined();
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

});
