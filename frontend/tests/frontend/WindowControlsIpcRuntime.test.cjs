/** @jest-environment node */

const {
  initializeWindowControlHandlersRuntime,
} = require('../../src/main/surfaces/window_controls_ipc_runtime.cjs');

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
    const senderWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
      getBounds: jest.fn(() => ({ x: 1920, y: 10, width: 500, height: 300 })),
    };
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
      BrowserWindow: {
        fromWebContents: jest.fn(() => senderWindow),
      },
      getWindows: () => ({
        mainWindow: senderWindow,
        chatWindow: null,
      }),
    });

    const result = await invokeHandlers['show-main-window']({ sender: {} }, { open: 'settings' });

    expect(result).toEqual({ success: true });
    expect(showMainWindow.mock.calls[0][0]).toEqual({
      focus: true,
      maximize: false,
      open: 'settings',
      reason: 'renderer:settings',
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

  test('passes maximize requests through show-main-window handler', async () => {
    const showMainWindow = jest.fn(() => ({ success: true }));
    const senderWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
      getBounds: jest.fn(() => ({ x: 1920, y: 10, width: 500, height: 300 })),
    };
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
      BrowserWindow: {
        fromWebContents: jest.fn(() => senderWindow),
      },
      getWindows: () => ({
        mainWindow: senderWindow,
        chatWindow: null,
      }),
    });

    const result = await invokeHandlers['show-main-window'](
      { sender: {} },
      { open: 'chat', maximize: true },
    );

    expect(result).toEqual({ success: true });
    expect(showMainWindow.mock.calls[0][0]).toEqual({
      focus: true,
      maximize: true,
      open: 'chat',
      reason: 'renderer:chat',
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
      },
    });
  });

  test('show-main-window prefers visible chat surface over a non-surface sender fallback', async () => {
    const showMainWindow = jest.fn(() => ({ success: true }));
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
      getDisplayMatching: jest.fn((bounds) => {
        if (bounds && bounds.x >= 1920) {
          return {
            id: 2,
            bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
            workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
          };
        }
        return {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        };
      }),
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    };
    const { invokeHandlers } = createRuntime({
      screen,
      showMainWindow,
      BrowserWindow: {
        fromWebContents: jest.fn(() => ({
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => false),
          getBounds: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 300 })),
        })),
      },
      getWindows: () => ({
        mainWindow: {
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => false),
          getBounds: jest.fn(() => ({ x: 0, y: 0, width: 1000, height: 700 })),
        },
        chatWindow: {
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => true),
          getBounds: jest.fn(() => ({ x: 2200, y: 60, width: 520, height: 116 })),
        },
      }),
    });

    const result = await invokeHandlers['show-main-window']({ sender: {} }, { open: 'settings' });

    expect(result).toEqual({ success: true });
    expect(showMainWindow.mock.calls[0][0]).toEqual({
      focus: true,
      maximize: false,
      open: 'settings',
      reason: 'renderer:settings',
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
      },
    });
  });

  test('show-main-window ignores a visible non-surface sender and still uses the visible chat surface', async () => {
    const showMainWindow = jest.fn(() => ({ success: true }));
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
      getDisplayMatching: jest.fn((bounds) => {
        if (bounds && bounds.x >= 1920) {
          return {
            id: 2,
            bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
            workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
          };
        }
        return {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        };
      }),
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    };
    const { invokeHandlers } = createRuntime({
      screen,
      showMainWindow,
      BrowserWindow: {
        fromWebContents: jest.fn(() => ({
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => true),
          getBounds: jest.fn(() => ({ x: 100, y: 40, width: 420, height: 280 })),
        })),
      },
      getWindows: () => ({
        mainWindow: {
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => false),
          getBounds: jest.fn(() => ({ x: 0, y: 0, width: 1000, height: 700 })),
        },
        chatWindow: {
          isDestroyed: jest.fn(() => false),
          isVisible: jest.fn(() => true),
          getBounds: jest.fn(() => ({ x: 2200, y: 60, width: 520, height: 116 })),
        },
      }),
    });

    const result = await invokeHandlers['show-main-window']({ sender: {} }, { open: 'settings' });

    expect(result).toEqual({ success: true });
    expect(showMainWindow.mock.calls[0][0]).toEqual({
      focus: true,
      maximize: false,
      open: 'settings',
      reason: 'renderer:settings',
      targetDisplayAffinity: {
        monitor_id: '2',
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
      },
    });
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
