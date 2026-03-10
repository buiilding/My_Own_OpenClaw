/** @jest-environment node */

const {
  createLazyRendererViewLoader,
  createOverlayBrowserWindow,
  loadRendererView,
} = require('../../frontend/src/main/main_window_overlay_runtime.cjs');

describe('main_window_overlay_runtime', () => {
  test('loadRendererView loads dev url with expected query params', () => {
    const targetWindow = {
      loadURL: jest.fn(),
    };

    loadRendererView({
      targetWindow,
      view: 'chatbox',
      app: { isPackaged: false },
      path: require('path'),
      vmMode: true,
      enableDevTransparencyUi: true,
      enableDebugStreamTrace: true,
      enableDebugToolScreenshot: true,
    });

    expect(targetWindow.loadURL).toHaveBeenCalledWith(
      'http://localhost:5173?view=chatbox&vm_mode=1&dev_ui=1&debug_stream=1&debug_tool_screenshot=1',
    );
  });

  test('createLazyRendererViewLoader loads the renderer once', () => {
    const targetWindow = {
      loadURL: jest.fn(),
    };
    const ensureLoaded = createLazyRendererViewLoader({
      targetWindow,
      view: 'chatbox',
      app: { isPackaged: false },
      path: require('path'),
    });

    expect(ensureLoaded()).toBe(true);
    expect(ensureLoaded()).toBe(false);
    expect(targetWindow.loadURL).toHaveBeenCalledTimes(1);
  });

  test('createOverlayBrowserWindow omits toolbar type on linux overlays', () => {
    const BrowserWindow = jest.fn((options) => ({ options }));

    const win = createOverlayBrowserWindow({
      BrowserWindow,
      path: require('path'),
      platform: 'linux',
      width: 320,
      height: 120,
      show: true,
      allowDevTools: true,
    });

    expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      width: 320,
      height: 120,
      transparent: true,
      show: true,
    }));
    expect(BrowserWindow.mock.calls[0][0]).not.toHaveProperty('type');
    expect(win.options.webPreferences.devTools).toBe(true);
  });

  test('createOverlayBrowserWindow keeps toolbar type on non-linux overlays', () => {
    const BrowserWindow = jest.fn((options) => ({ options }));

    const win = createOverlayBrowserWindow({
      BrowserWindow,
      path: require('path'),
      platform: 'win32',
      width: 320,
      height: 120,
      allowDevTools: false,
    });

    expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      width: 320,
      height: 120,
      type: 'toolbar',
      transparent: true,
    }));
    expect(win.options.webPreferences.devTools).toBe(false);
  });
});
