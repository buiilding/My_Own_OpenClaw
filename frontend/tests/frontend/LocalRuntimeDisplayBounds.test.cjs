/** @jest-environment node */

const {
  resolveScreenshotToolDisplayBounds,
} = require('../../src/main/sidecar/local_runtime_display_bounds.cjs');

describe('local_runtime_display_bounds', () => {
  test('prefers visible sender display affinity for screenshot tool args', () => {
    const resolveActiveSurfaceDisplayAffinityForWindows = jest.fn(() => ({
      monitor_id: '2',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4480, height: 1440 },
    }));

    const result = resolveScreenshotToolDisplayBounds({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 1 },
      resolveChatWindow: jest.fn(() => null),
      resolveMainWindow: jest.fn(() => null),
      resolveActiveSurfaceDisplayAffinityForWindows,
      toScreenshotDisplayBounds: jest.fn((affinity) => ({
        ...affinity.bounds,
        monitor_id: affinity.monitor_id,
      })),
    });

    expect(resolveActiveSurfaceDisplayAffinityForWindows).toHaveBeenCalledWith({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 1 },
      getWindows: expect.any(Function),
      getActiveDisplayAffinity: expect.any(Function),
    });
    expect(resolveActiveSurfaceDisplayAffinityForWindows.mock.calls[0][0].getWindows()).toEqual({
      chatWindow: null,
      mainWindow: null,
    });
    expect(result).toEqual({
      x: 1920,
      y: 0,
      width: 2560,
      height: 1440,
      monitor_id: '2',
    });
  });

  test('falls back to active display affinity when sender window is hidden', () => {
    const resolveActiveSurfaceDisplayAffinityForWindows = jest.fn(() => ({
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
      resolveActiveSurfaceDisplayAffinityForWindows,
      toScreenshotDisplayBounds: jest.fn((affinity) => ({
        ...affinity.bounds,
        monitor_id: affinity.monitor_id,
        desktop_virtual_bounds: affinity.desktopVirtualBounds,
      })),
    });

    expect(resolveActiveSurfaceDisplayAffinityForWindows).toHaveBeenCalledTimes(1);
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
    const resolveActiveSurfaceDisplayAffinityForWindows = jest.fn(() => ({
      monitor_id: '7',
      bounds: { x: 3000, y: 0, width: 1920, height: 1080 },
      workArea: { x: 3000, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
    }));

    const result = resolveScreenshotToolDisplayBounds({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 2 },
      resolveChatWindow: jest.fn(() => chatWindow),
      resolveMainWindow: jest.fn(() => mainWindow),
      resolveActiveSurfaceDisplayAffinityForWindows,
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
  });

  test('does not treat response overlay as a screenshot monitor source of truth', () => {
    const resolveActiveSurfaceDisplayAffinityForWindows = jest.fn(() => ({
      monitor_id: '1',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      desktopVirtualBounds: { x: 0, y: 0, width: 4920, height: 1080 },
    }));

    const result = resolveScreenshotToolDisplayBounds({
      BrowserWindow: {},
      screen: {},
      webContents: { id: 2 },
      resolveChatWindow: jest.fn(() => null),
      resolveMainWindow: jest.fn(() => null),
      resolveActiveSurfaceDisplayAffinityForWindows,
      toScreenshotDisplayBounds: jest.fn((affinity) => ({
        ...affinity.bounds,
        monitor_id: affinity.monitor_id,
      })),
    });

    expect(result).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      monitor_id: '1',
    });
  });
});
