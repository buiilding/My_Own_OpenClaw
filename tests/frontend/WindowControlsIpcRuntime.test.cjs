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
      BrowserWindow: {
        fromWebContents: jest.fn(() => ({
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => true),
          getBounds: jest.fn(() => ({ x: 1920, y: 10, width: 500, height: 300 })),
        })),
      },
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
    const screen = {
      getAllDisplays: jest.fn(() => ([
        {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        },
        {
          id: 2,
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      ])),
      getDisplayMatching: jest.fn(() => ({
        id: 2,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      })),
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    };
    const { invokeHandlers } = createRuntime({
      screen,
      showMainWindow,
      normalizeMainWindowOpenTarget,
      emitMainWindowOpenTarget,
    });

    const result = await invokeHandlers['show-main-window']({ sender: {} }, { open: 'settings' });

    expect(result).toEqual({ success: true });
    expect(showMainWindow).toHaveBeenCalledWith({
      focus: true,
      maximize: false,
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
      },
    });
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
