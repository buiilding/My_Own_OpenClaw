/** @jest-environment node */

const {
  resolveScreenshotToolDisplayBounds,
} = require('../../frontend/src/main/local_backend_bridge_display_bounds.cjs');

describe('local_backend_bridge_display_bounds', () => {
  test('prefers visible sender display affinity for screenshot tool args', () => {
    const resolveDisplayAffinityForWindow = jest.fn(() => null);
    const resolveDisplayAffinityForWebContents = jest.fn(() => ({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    }));
    const getActiveDisplayAffinity = jest.fn(() => ({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    }));

    const result = resolveScreenshotToolDisplayBounds({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 1 },
      resolveChatWindow: jest.fn(() => null),
      resolveMainWindow: jest.fn(() => null),
      resolveResponseWindow: jest.fn(() => null),
      getActiveDisplayAffinity,
      resolveDisplayAffinityForWindow,
      resolveDisplayAffinityForWebContents,
      toScreenshotDisplayBounds: jest.fn((affinity) => ({
        ...affinity.bounds,
        monitor_id: affinity.monitor_id,
      })),
    });

    expect(resolveDisplayAffinityForWebContents).toHaveBeenCalledWith({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 1 },
      requireVisible: true,
    });
    expect(resolveDisplayAffinityForWindow).not.toHaveBeenCalled();
    expect(getActiveDisplayAffinity).not.toHaveBeenCalled();
    expect(result).toEqual({
      x: 1920,
      y: 0,
      width: 2560,
      height: 1440,
      monitor_id: '2',
    });
  });

  test('falls back to active display affinity when sender window is hidden', () => {
    const resolveDisplayAffinityForWindow = jest.fn(() => null);
    const getActiveDisplayAffinity = jest.fn(() => ({
      monitor_id: '3',
      bounds: { x: -1600, y: 0, width: 1600, height: 900 },
      workArea: { x: -1600, y: 0, width: 1600, height: 860 },
      desktopVirtualBounds: { x: -1600, y: 0, width: 6080, height: 1440 },
    }));

    const result = resolveScreenshotToolDisplayBounds({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 2 },
      resolveChatWindow: jest.fn(() => null),
      resolveMainWindow: jest.fn(() => null),
      resolveResponseWindow: jest.fn(() => null),
      getActiveDisplayAffinity,
      resolveDisplayAffinityForWindow,
      resolveDisplayAffinityForWebContents: jest.fn(() => null),
      toScreenshotDisplayBounds: jest.fn((affinity) => ({
        ...affinity.bounds,
        monitor_id: affinity.monitor_id,
        desktop_virtual_bounds: affinity.desktopVirtualBounds,
      })),
    });

    expect(getActiveDisplayAffinity).toHaveBeenCalledTimes(1);
    expect(resolveDisplayAffinityForWindow).not.toHaveBeenCalled();
    expect(result).toEqual({
      x: -1600,
      y: 0,
      width: 1600,
      height: 900,
      monitor_id: '3',
      desktop_virtual_bounds: { x: -1600, y: 0, width: 6080, height: 1440 },
    });
  });

  test('prefers visible chat window display affinity over stale active affinity when sender window is hidden', () => {
    const chatWindow = { id: 'chat-window' };
    const mainWindow = { id: 'main-window' };
    const responseWindow = { id: 'response-window' };
    const resolveDisplayAffinityForWindow = jest.fn((screenArg, targetWindow) => {
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
    const getActiveDisplayAffinity = jest.fn(() => ({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
    }));

    const result = resolveScreenshotToolDisplayBounds({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 2 },
      resolveChatWindow: jest.fn(() => chatWindow),
      resolveMainWindow: jest.fn(() => mainWindow),
      resolveResponseWindow: jest.fn(() => responseWindow),
      getActiveDisplayAffinity,
      resolveDisplayAffinityForWindow,
      resolveDisplayAffinityForWebContents: jest.fn(() => null),
      toScreenshotDisplayBounds: jest.fn((affinity) => ({
        ...affinity.bounds,
        monitor_id: affinity.monitor_id,
      })),
    });

    expect(result).toEqual({
      x: 3000,
      y: 0,
      width: 1920,
      height: 1080,
      monitor_id: '7',
    });
    expect(getActiveDisplayAffinity).not.toHaveBeenCalled();
  });
});
