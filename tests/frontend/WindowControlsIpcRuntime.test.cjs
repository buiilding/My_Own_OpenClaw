/** @jest-environment node */

const {
  initializeWindowControlHandlersRuntime,
} = require('../../frontend/src/main/window_controls_ipc_runtime.cjs');

describe('window_controls_ipc_runtime', () => {
  function createRuntime(overrides = {}) {
    const invokeHandlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        invokeHandlers[channel] = handler;
      }),
    };

    initializeWindowControlHandlersRuntime({
      ipcMain,
      screen: {},
      getWindows: () => ({}),
      showMainWindow: jest.fn(() => ({ success: true })),
      normalizeMainWindowOpenTarget: jest.fn(() => null),
      emitMainWindowOpenTarget: jest.fn(),
      ...overrides,
    });

    return {
      invokeHandlers,
    };
  }

  test('routes main window open target only through window-control module', async () => {
    const showMainWindow = jest.fn(() => ({ success: true }));
    const normalizeMainWindowOpenTarget = jest.fn(() => 'settings');
    const emitMainWindowOpenTarget = jest.fn();
    const { invokeHandlers } = createRuntime({
      showMainWindow,
      normalizeMainWindowOpenTarget,
      emitMainWindowOpenTarget,
    });

    const result = await invokeHandlers['show-main-window'](null, { open: 'settings' });

    expect(result).toEqual({ success: true });
    expect(showMainWindow).toHaveBeenCalledWith({ focus: true, maximize: false });
    expect(normalizeMainWindowOpenTarget).toHaveBeenCalledWith({ open: 'settings' });
    expect(emitMainWindowOpenTarget).toHaveBeenCalledWith('settings');
    expect(typeof invokeHandlers['window-minimize']).toBe('function');
    expect(typeof invokeHandlers['window-toggle-maximize']).toBe('function');
    expect(typeof invokeHandlers['window-close']).toBe('function');
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
