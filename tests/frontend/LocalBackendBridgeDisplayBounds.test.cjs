/** @jest-environment node */

const {
  resolveScreenshotToolDisplayBounds,
} = require('../../frontend/src/main/local_backend_bridge_display_bounds.cjs');

describe('local_backend_bridge_display_bounds', () => {
  test('prefers visible sender display affinity for screenshot tool args', () => {
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
      getActiveDisplayAffinity,
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
      getActiveDisplayAffinity,
      resolveDisplayAffinityForWebContents: jest.fn(() => null),
      toScreenshotDisplayBounds: jest.fn((affinity) => ({
        ...affinity.bounds,
        monitor_id: affinity.monitor_id,
        desktop_virtual_bounds: affinity.desktopVirtualBounds,
      })),
    });

    expect(getActiveDisplayAffinity).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      x: -1600,
      y: 0,
      width: 1600,
      height: 900,
      monitor_id: '3',
      desktop_virtual_bounds: { x: -1600, y: 0, width: 6080, height: 1440 },
    });
  });
});
