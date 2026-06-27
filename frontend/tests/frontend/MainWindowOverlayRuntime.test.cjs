/** @jest-environment node */

const {
  createMainWindowOverlayRuntime,
} = require('../../src/main/surfaces/main_window_overlay_runtime.cjs');

describe('main_window_overlay_runtime', () => {
  const overlayRuntime = createMainWindowOverlayRuntime();

  test('exposes only the overlay runtime facade', () => {
    const overlayRuntimeModule = require('../../src/main/surfaces/main_window_overlay_runtime.cjs');

    expect(overlayRuntimeModule.createMainWindowOverlayRuntime).toBe(createMainWindowOverlayRuntime);
    expect(overlayRuntimeModule.loadRendererView).toBeUndefined();
    expect(overlayRuntimeModule.createLazyRendererViewLoader).toBeUndefined();
    expect(overlayRuntimeModule.attachRendererConsoleLogging).toBeUndefined();
    expect(overlayRuntimeModule.createOverlayBrowserWindow).toBeUndefined();
  });

  test('loadRendererView loads dev url with expected query params', () => {
    const targetWindow = {
      loadURL: jest.fn(),
    };

    overlayRuntime.loadRendererView({
      targetWindow,
      view: 'minimal-chat-pill',
      app: { isPackaged: false },
      path: require('path'),
      vmMode: true,
      enableDevTransparencyUi: true,
      enableDebugStreamTrace: true,
      enableDebugToolScreenshot: true,
    });

    expect(targetWindow.loadURL).toHaveBeenCalledWith(
      'http://localhost:5173?view=minimal-chat-pill&vm_mode=1&dev_ui=1&debug_stream=1&debug_tool_screenshot=1',
    );
  });

  test('createLazyRendererViewLoader loads the renderer once', () => {
    const targetWindow = {
      loadURL: jest.fn(),
    };
    const ensureLoaded = overlayRuntime.createLazyRendererViewLoader({
      targetWindow,
      view: 'minimal-chat-pill',
      app: { isPackaged: false },
      path: require('path'),
    });

    expect(ensureLoaded()).toBe(true);
    expect(ensureLoaded()).toBe(false);
    expect(targetWindow.loadURL).toHaveBeenCalledTimes(1);
  });

  test('attaches renderer console-message logging once per webContents', () => {
    const handlers = {};
    const webContents = {
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const writeLayerLogLine = jest.fn();
    const writeSessionBanner = jest.fn();
    const writeVerboseLogLine = jest.fn();
    const writeVerboseSessionBanner = jest.fn();

    expect(overlayRuntime.attachRendererConsoleLogging({
      targetWindow: { webContents },
      view: 'chat-pill',
      writeLayerLogLine,
      writeSessionBanner,
      writeVerboseLogLine,
      writeVerboseSessionBanner,
    })).toBe(true);
    expect(overlayRuntime.attachRendererConsoleLogging({
      targetWindow: { webContents },
      view: 'chat-pill',
      writeLayerLogLine,
      writeSessionBanner,
      writeVerboseLogLine,
      writeVerboseSessionBanner,
    })).toBe(false);
    expect(webContents.__desktopRuntimeRendererConsoleLoggingAttached).toBe(true);

    expect(writeSessionBanner).toHaveBeenCalledWith('renderer', {
      sessionLabel: 'chat-pill renderer console log session',
    });
    expect(writeVerboseSessionBanner).toHaveBeenCalledWith({
      sessionLabel: 'chat-pill renderer verbose console log session',
    });
    handlers['console-message']({}, 'warning', 'mounted', 12, 'app.js');

    expect(writeVerboseLogLine).toHaveBeenCalledWith(
      '[Renderer][chat-pill][console:warning] mounted app.js:12',
    );
    expect(writeLayerLogLine).toHaveBeenCalledWith(
      'renderer',
      '[Renderer][chat-pill][console:warning] mounted app.js:12',
    );
  });

  test('keeps low-severity renderer console noise out of the default renderer log', () => {
    const handlers = {};
    const webContents = {
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const writeLayerLogLine = jest.fn();
    const writeVerboseLogLine = jest.fn();

    overlayRuntime.attachRendererConsoleLogging({
      targetWindow: { webContents },
      view: 'main',
      writeLayerLogLine,
      writeSessionBanner: jest.fn(),
      writeVerboseLogLine,
      writeVerboseSessionBanner: jest.fn(),
    });

    handlers['console-message']({}, 0, '[vite] connected.', 827, 'vite/client');

    expect(writeVerboseLogLine).toHaveBeenCalledWith(
      '[Renderer][main][console:0] [vite] connected. vite/client:827',
    );
    expect(writeLayerLogLine).not.toHaveBeenCalled();
  });

  test('routes newer Electron console-message details payloads through renderer logs', () => {
    const handlers = {};
    const webContents = {
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const writeLayerLogLine = jest.fn();
    const writeVerboseLogLine = jest.fn();

    overlayRuntime.attachRendererConsoleLogging({
      targetWindow: { webContents },
      view: 'main',
      writeLayerLogLine,
      writeSessionBanner: jest.fn(),
      writeVerboseLogLine,
      writeVerboseSessionBanner: jest.fn(),
    });

    handlers['console-message']({}, {
      level: 'error',
      message: 'failed',
      lineNumber: 9,
      sourceId: 'renderer.js',
    });

    expect(writeVerboseLogLine).toHaveBeenCalledWith(
      '[Renderer][main][console:error] failed renderer.js:9',
    );
    expect(writeLayerLogLine).toHaveBeenCalledWith(
      'renderer',
      '[Renderer][main][console:error] failed renderer.js:9',
    );
  });

  test('createOverlayBrowserWindow omits toolbar type on linux overlays', () => {
    const BrowserWindow = jest.fn((options) => ({ options }));

    const win = overlayRuntime.createOverlayBrowserWindow({
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
    expect(win.options.webPreferences.additionalArguments).toEqual(
      expect.arrayContaining([
        expect.stringContaining('--desktop-runtime-ipc-channels='),
      ]),
    );
    expect(win.options.webPreferences.additionalArguments).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('--desktop-' + 'agent-ipc-channels='),
      ]),
    );
    expect(BrowserWindow.mock.calls[0][0]).not.toHaveProperty('type');
    expect(win.options.webPreferences.devTools).toBe(true);
  });

  test('createOverlayBrowserWindow starts hidden by default', () => {
    const BrowserWindow = jest.fn((options) => ({ options }));

    const win = overlayRuntime.createOverlayBrowserWindow({
      BrowserWindow,
      path: require('path'),
      platform: 'darwin',
      width: 320,
      height: 120,
      allowDevTools: false,
    });

    expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      width: 320,
      height: 120,
      show: false,
    }));
    expect(win.options.show).toBe(false);
  });

  test('createOverlayBrowserWindow uses native panel windows on mac overlays', () => {
    const BrowserWindow = jest.fn((options) => ({ options }));

    const win = overlayRuntime.createOverlayBrowserWindow({
      BrowserWindow,
      path: require('path'),
      platform: 'darwin',
      width: 320,
      height: 120,
      allowDevTools: false,
    });

    expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      width: 320,
      height: 120,
      type: 'panel',
      transparent: true,
    }));
    expect(win.options.webPreferences.devTools).toBe(false);
  });

  test('createOverlayBrowserWindow keeps toolbar type on windows overlays', () => {
    const BrowserWindow = jest.fn((options) => ({ options }));

    const win = overlayRuntime.createOverlayBrowserWindow({
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
