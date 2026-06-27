/** @jest-environment node */

const {
  centerWindowOnDisplayWorkArea,
  getActiveDisplayAffinity,
  resolveDisplayAffinityForBounds,
  resolveActiveSurfaceDisplayAffinity,
  resolveActiveSurfaceDisplayAffinityForWindows,
  syncActiveDisplayAffinityForWindow,
  syncVisibleSurfaceDisplayAffinity,
  setActiveDisplayAffinity,
  toScreenshotDisplayBounds,
} = require('../../src/main/surfaces/display_affinity_runtime.cjs');

describe('display_affinity_runtime', () => {
  afterEach(() => {
    setActiveDisplayAffinity(null);
  });

  test('resolves display affinity from sender surface webContents and preserves monitor id', () => {
    const screen = {
      getDisplayMatching: jest.fn(() => ({
        id: 42,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      })),
      getAllDisplays: jest.fn(() => ([
        {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        },
        {
          id: 42,
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      ])),
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    };
    const targetWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
      getBounds: jest.fn(() => ({ x: 2100, y: 100, width: 800, height: 600 })),
    };
    const BrowserWindow = {
      fromWebContents: jest.fn(() => targetWindow),
    };
    const webContents = {};

    expect(resolveActiveSurfaceDisplayAffinity({
      BrowserWindow,
      screen,
      webContents,
      chatWindow: targetWindow,
      mainWindow: null,
      getActiveDisplayAffinity: jest.fn(() => null),
    })).toEqual({
      monitor_id: '42',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });
    expect(BrowserWindow.fromWebContents).toHaveBeenCalledWith(webContents);
    expect(screen.getDisplayMatching).toHaveBeenCalledWith({ x: 2100, y: 100, width: 800, height: 600 });
  });

  test('normalizes window bounds before display matching', () => {
    const screen = {
      getDisplayMatching: jest.fn(() => ({
        id: 42,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      })),
      getAllDisplays: jest.fn(() => ([
        {
          id: 42,
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      ])),
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    };

    expect(resolveDisplayAffinityForBounds(screen, {
      x: 2100.4,
      y: 100.6,
      width: 800.2,
      height: 600.8,
    })).toEqual({
      monitor_id: '42',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 1920, y: 0, width: 2560, height: 1440 },
    });
    expect(screen.getDisplayMatching).toHaveBeenCalledWith({
      x: 2100,
      y: 101,
      width: 800,
      height: 601,
    });
  });

  test('falls back to primary display when window bounds are malformed', () => {
    const screen = {
      getDisplayMatching: jest.fn(),
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    };

    expect(resolveDisplayAffinityForBounds(screen, {
      x: Infinity,
      y: 100,
      width: 800,
      height: 600,
    })).toEqual({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: null,
    });
    expect(screen.getDisplayMatching).not.toHaveBeenCalled();
  });

  test('falls back when hidden sender surface is not visible', () => {
    const screen = {
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    };
    const targetWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      getBounds: jest.fn(),
    };
    const BrowserWindow = {
      fromWebContents: jest.fn(() => targetWindow),
    };

    expect(resolveActiveSurfaceDisplayAffinity({
      BrowserWindow,
      screen,
      webContents: {},
      chatWindow: targetWindow,
      mainWindow: null,
      getActiveDisplayAffinity: jest.fn(() => null),
    })).toBeNull();
    expect(targetWindow.getBounds).not.toHaveBeenCalled();
  });

  test('falls back from hidden sender surface to visible main surface', () => {
    const hiddenChatWindow = { id: 'chat' };
    const visibleMainWindow = { id: 'main' };
    const resolveDisplayAffinityForWindow = jest.fn((_screen, targetWindow) => {
      if (targetWindow === hiddenChatWindow) {
        return null;
      }
      if (targetWindow === visibleMainWindow) {
        return {
          monitor_id: '2',
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
          desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
        };
      }
      return null;
    });

    const result = resolveActiveSurfaceDisplayAffinity({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 'sender' },
      chatWindow: hiddenChatWindow,
      mainWindow: visibleMainWindow,
      resolveWindowForWebContents: jest.fn(() => hiddenChatWindow),
      resolveDisplayAffinityForWindow,
      resolveDisplayAffinityForWebContents: jest.fn(() => null),
      getActiveDisplayAffinity: jest.fn(() => null),
    });

    expect(result).toEqual({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });
    expect(resolveDisplayAffinityForWindow).toHaveBeenNthCalledWith(1, {}, hiddenChatWindow, { requireVisible: true });
    expect(resolveDisplayAffinityForWindow).toHaveBeenNthCalledWith(2, {}, visibleMainWindow, { requireVisible: true });
  });

  test('falls back when destroyed sender surface cannot be resolved', () => {
    const screen = {
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    };
    const targetWindow = {
      isDestroyed: jest.fn(() => true),
      isVisible: jest.fn(),
      getBounds: jest.fn(),
    };
    const BrowserWindow = {
      fromWebContents: jest.fn(() => targetWindow),
    };

    expect(resolveActiveSurfaceDisplayAffinity({
      BrowserWindow,
      screen,
      webContents: {},
      chatWindow: targetWindow,
      mainWindow: null,
      getActiveDisplayAffinity: jest.fn(() => null),
    })).toBeNull();
    expect(targetWindow.isVisible).not.toHaveBeenCalled();
    expect(targetWindow.getBounds).not.toHaveBeenCalled();
  });

  test('centers a window inside the target display work area', () => {
    const targetWindow = {
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
    };

    const positioned = centerWindowOnDisplayWorkArea(targetWindow, {
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    });

    expect(positioned).toBe(true);
    expect(targetWindow.setBounds).toHaveBeenCalledWith({
      x: 2700,
      y: 350,
      width: 1000,
      height: 700,
    }, false);
  });

  test('refuses to center a window with malformed target work area bounds', () => {
    const targetWindow = {
      getSize: jest.fn(() => [1000, 700]),
      setBounds: jest.fn(),
    };

    expect(centerWindowOnDisplayWorkArea(targetWindow, {
      monitor_id: 'bad',
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      workArea: { x: Infinity, y: 0, width: 2560, height: 1400 },
    })).toBe(false);
    expect(targetWindow.setBounds).not.toHaveBeenCalled();
  });

  test('stores active display affinity as cloned screenshot bounds payload', () => {
    setActiveDisplayAffinity({
      monitor_id: '7',
      bounds: { x: 3000, y: 0, width: 1920, height: 1080 },
      workArea: { x: 3000, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
    });

    const affinity = getActiveDisplayAffinity();
    expect(affinity).toEqual({
      monitor_id: '7',
      bounds: { x: 3000, y: 0, width: 1920, height: 1080 },
      workArea: { x: 3000, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
    });
    expect(toScreenshotDisplayBounds(affinity)).toEqual({
      x: 3000,
      y: 0,
      width: 1920,
      height: 1080,
      monitor_id: '7',
      desktop_virtual_bounds: { x: 0, y: 0, width: 4920, height: 1080 },
    });

    affinity.bounds.x = 0;
    expect(getActiveDisplayAffinity().bounds.x).toBe(3000);
  });

  test('falls back to primary display when sender display matching is unavailable', () => {
    const screen = {
      getAllDisplays: jest.fn(() => ([
        {
          id: 5,
          bounds: { x: 0, y: 0, width: 1600, height: 900 },
          workArea: { x: 0, y: 0, width: 1600, height: 860 },
        },
      ])),
      getPrimaryDisplay: jest.fn(() => ({
        id: 5,
        bounds: { x: 0, y: 0, width: 1600, height: 900 },
        workArea: { x: 0, y: 0, width: 1600, height: 860 },
      })),
    };
    const targetWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
      getBounds: jest.fn(() => ({ x: 10, y: 20, width: 300, height: 400 })),
    };
    const BrowserWindow = {
      fromWebContents: jest.fn(() => targetWindow),
    };
    const webContents = {};
    expect(resolveActiveSurfaceDisplayAffinity({
      BrowserWindow,
      screen,
      webContents,
      chatWindow: targetWindow,
      mainWindow: null,
      getActiveDisplayAffinity: jest.fn(() => null),
    })).toEqual({
      monitor_id: '5',
      bounds: { x: 0, y: 0, width: 1600, height: 900 },
      workArea: { x: 0, y: 0, width: 1600, height: 860 },
      desktopVirtualBounds: { x: 0, y: 0, width: 1600, height: 900 },
    });
    expect(BrowserWindow.fromWebContents).toHaveBeenCalledWith(webContents);
  });

  test('syncs active display affinity from a visible window', () => {
    const screen = {
      getDisplayMatching: jest.fn(() => ({
        id: 9,
        bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
        workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      })),
      getAllDisplays: jest.fn(() => ([
        {
          id: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        },
        {
          id: 9,
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
        },
      ])),
      getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    };
    const targetWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
      getBounds: jest.fn(() => ({ x: 2300, y: 50, width: 800, height: 600 })),
    };

    const result = syncActiveDisplayAffinityForWindow(screen, targetWindow);

    expect(result).toEqual({
      monitor_id: '9',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });
    expect(getActiveDisplayAffinity()).toEqual(result);
  });

  test('does not update stored display affinity from a hidden window', () => {
    const storedAffinity = {
      monitor_id: 'stored',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    };
    setActiveDisplayAffinity(storedAffinity);
    const hiddenWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
      getBounds: jest.fn(),
    };

    const result = syncActiveDisplayAffinityForWindow({}, hiddenWindow);

    expect(result).toBeNull();
    expect(hiddenWindow.getBounds).not.toHaveBeenCalled();
    expect(getActiveDisplayAffinity()).toEqual(storedAffinity);
  });

  test('syncs visible surface display affinity from chat before main', () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
    };
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
    };
    const syncActiveDisplayAffinityForWindow = jest.fn((_screen, targetWindow) => (
      targetWindow === chatWindow ? { monitor_id: '7' } : { monitor_id: '2' }
    ));

    expect(syncVisibleSurfaceDisplayAffinity({
      screen: {},
      chatWindow,
      mainWindow,
      syncActiveDisplayAffinityForWindow,
    })).toEqual({ monitor_id: '7' });
    expect(syncActiveDisplayAffinityForWindow).toHaveBeenCalledTimes(1);
    expect(syncActiveDisplayAffinityForWindow).toHaveBeenCalledWith({}, chatWindow, { requireVisible: true });
  });

  test('resolves active surface display affinity for windows using getWindows chat and main surfaces', () => {
    const getWindows = jest.fn(() => ({
      chatWindow: { id: 'chat' },
      mainWindow: { id: 'main' },
    }));
    const getActiveDisplayAffinity = jest.fn(() => ({ monitor_id: 'stored' }));
    const result = resolveActiveSurfaceDisplayAffinityForWindows({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 7 },
      getWindows,
      getActiveDisplayAffinity,
    });

    expect(getWindows).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ monitor_id: 'stored' });
  });

  test('resolves active surface affinity from visible chat before stored fallback', () => {
    const chatWindow = { id: 'chat' };
    const mainWindow = { id: 'main' };
    const resolveDisplayAffinityForWindow = jest.fn((_screen, targetWindow) => {
      if (targetWindow === chatWindow) {
        return {
          monitor_id: '7',
          bounds: { x: 3000, y: 0, width: 1920, height: 1080 },
          workArea: { x: 3000, y: 0, width: 1920, height: 1040 },
          desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
        };
      }
      return null;
    });
    const getStoredAffinity = jest.fn(() => ({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
    }));

    const result = resolveActiveSurfaceDisplayAffinity({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 'sender' },
      chatWindow,
      mainWindow,
      resolveDisplayAffinityForWindow,
      resolveDisplayAffinityForWebContents: jest.fn(() => null),
      getActiveDisplayAffinity: getStoredAffinity,
    });

    expect(result).toEqual({
      monitor_id: '7',
      bounds: { x: 3000, y: 0, width: 1920, height: 1080 },
      workArea: { x: 3000, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
    });
    expect(resolveDisplayAffinityForWindow).toHaveBeenCalledWith({}, chatWindow, { requireVisible: true });
    expect(getStoredAffinity).not.toHaveBeenCalled();
  });

  test('ignores a visible non-surface sender and prefers the visible chat surface', () => {
    const senderWindow = { id: 'response' };
    const chatWindow = { id: 'chat' };
    const mainWindow = { id: 'main' };
    const resolveDisplayAffinityForWindow = jest.fn((_screen, targetWindow) => {
      if (targetWindow === chatWindow) {
        return {
          monitor_id: '7',
          bounds: { x: 3000, y: 0, width: 1920, height: 1080 },
          workArea: { x: 3000, y: 0, width: 1920, height: 1040 },
          desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
        };
      }
      return null;
    });
    const resolveDisplayAffinityForWebContents = jest.fn(() => ({
      monitor_id: '9',
      bounds: { x: -1600, y: 0, width: 1600, height: 900 },
      workArea: { x: -1600, y: 0, width: 1600, height: 860 },
      desktopVirtualBounds: { x: -1600, y: 0, width: 6520, height: 1080 },
    }));

    const result = resolveActiveSurfaceDisplayAffinity({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 'sender' },
      chatWindow,
      mainWindow,
      resolveWindowForWebContents: jest.fn(() => senderWindow),
      resolveDisplayAffinityForWindow,
      resolveDisplayAffinityForWebContents,
      getActiveDisplayAffinity: jest.fn(() => null),
    });

    expect(resolveDisplayAffinityForWebContents).not.toHaveBeenCalled();
    expect(result).toEqual({
      monitor_id: '7',
      bounds: { x: 3000, y: 0, width: 1920, height: 1080 },
      workArea: { x: 3000, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
    });
  });

  test('resolves active surface affinity from visible main before stored fallback', () => {
    const mainWindow = { id: 'main' };
    const resolveDisplayAffinityForWindow = jest.fn((_screen, targetWindow) => {
      if (targetWindow === mainWindow) {
        return {
          monitor_id: '2',
          bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
          workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
          desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
        };
      }
      return null;
    });

    const result = resolveActiveSurfaceDisplayAffinity({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 'sender' },
      chatWindow: null,
      mainWindow,
      resolveDisplayAffinityForWindow,
      resolveDisplayAffinityForWebContents: jest.fn(() => null),
      getActiveDisplayAffinity: jest.fn(() => null),
    });

    expect(result).toEqual({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    });
  });

  test('does not fall back to primary display through sender resolution when webContents is absent', () => {
    const chatWindow = { id: 'chat' };
    const resolveDisplayAffinityForWindow = jest.fn((_screen, targetWindow) => {
      if (targetWindow === chatWindow) {
        return {
          monitor_id: '3',
          bounds: { x: 2560, y: 0, width: 1600, height: 900 },
          workArea: { x: 2560, y: 0, width: 1600, height: 860 },
          desktopVirtualBounds: { x: 0, y: 0, width: 4160, height: 1080 },
        };
      }
      return null;
    });
    const resolveDisplayAffinityForWebContents = jest.fn(() => ({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4160, height: 1080 },
    }));

    const result = resolveActiveSurfaceDisplayAffinity({
      BrowserWindow: {},
      screen: {},
      webContents: null,
      chatWindow,
      mainWindow: null,
      resolveDisplayAffinityForWindow,
      resolveDisplayAffinityForWebContents,
      getActiveDisplayAffinity: jest.fn(() => null),
    });

    expect(resolveDisplayAffinityForWebContents).not.toHaveBeenCalled();
    expect(result).toEqual({
      monitor_id: '3',
      bounds: { x: 2560, y: 0, width: 1600, height: 900 },
      workArea: { x: 2560, y: 0, width: 1600, height: 860 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4160, height: 1080 },
    });
  });

  test('falls back to stored affinity when a chat surface candidate is destroyed', () => {
    const chatWindow = { id: 'chat' };
    const resolveDisplayAffinityForWindow = jest.fn((_screen, targetWindow) => {
      if (targetWindow === chatWindow) {
        return null;
      }
      return null;
    });
    const storedAffinity = {
      monitor_id: '5',
      bounds: { x: -1600, y: 0, width: 1600, height: 900 },
      workArea: { x: -1600, y: 0, width: 1600, height: 860 },
      desktopVirtualBounds: { x: -1600, y: 0, width: 6080, height: 1440 },
    };

    const result = resolveActiveSurfaceDisplayAffinity({
      BrowserWindow: {},
      screen: {},
      webContents: null,
      chatWindow,
      mainWindow: null,
      resolveDisplayAffinityForWindow,
      getActiveDisplayAffinity: jest.fn(() => storedAffinity),
    });

    expect(result).toEqual(storedAffinity);
  });
});
