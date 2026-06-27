/** @jest-environment node */

jest.mock('electron', () => ({
  nativeImage: {
    createFromPath: jest.fn(() => ({ isEmpty: () => false })),
    createFromDataURL: jest.fn(() => ({ isEmpty: () => false })),
  },
}));

const {
  createMainWindow,
  createChatWindow,
  createResponseWindow,
  createTray,
  prepareOverlayQueryCaptureFocus,
} = require('../../src/main/surfaces/main_window_runtime.cjs');

describe('main_window_runtime prepareOverlayQueryCaptureFocus', () => {
  function createFocusableWindow() {
    return {
      isDestroyed: jest.fn().mockReturnValue(false),
      blur: jest.fn(),
    };
  }

  test('blurs assistant windows and returns a non-verifying result', async () => {
    const chatWindow = createFocusableWindow();
    const responseWindow = createFocusableWindow();
    const mainWindow = createFocusableWindow();

    const result = await prepareOverlayQueryCaptureFocus({
      chatWindow,
      responseWindow,
      mainWindow,
      platform: 'linux',
      waitMs: 0,
    });

    expect(chatWindow.blur).toHaveBeenCalledTimes(1);
    expect(responseWindow.blur).toHaveBeenCalledTimes(1);
    expect(mainWindow.blur).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      restoredExternalFocus: false,
      demotedOverlayFocus: false,
      externalFocusActive: false,
      canVerifyExternalFocus: false,
    });
  });

  test('returns a blur-only result even without assistant windows', async () => {
    const result = await prepareOverlayQueryCaptureFocus({
      platform: 'linux',
      waitMs: 0,
    });

    expect(result).toEqual({
      restoredExternalFocus: false,
      demotedOverlayFocus: false,
      externalFocusActive: false,
      canVerifyExternalFocus: false,
    });
  });

  test('waits for the requested settle interval without restoring external focus', async () => {
    jest.useFakeTimers();

    try {
      const pending = prepareOverlayQueryCaptureFocus({
        platform: 'linux',
        waitMs: 25,
      });
      jest.advanceTimersByTime(25);
      const result = await pending;

      expect(result).toEqual({
        restoredExternalFocus: false,
        demotedOverlayFocus: false,
        externalFocusActive: false,
        canVerifyExternalFocus: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('falls back to the default settle interval for invalid wait overrides', async () => {
    jest.useFakeTimers();

    try {
      let settled = false;
      const pending = prepareOverlayQueryCaptureFocus({
        platform: 'linux',
        waitMs: '120ms',
      }).then((result) => {
        settled = true;
        return result;
      });
      await Promise.resolve();

      expect(settled).toBe(false);

      jest.advanceTimersByTime(119);
      await Promise.resolve();
      expect(settled).toBe(false);

      jest.advanceTimersByTime(1);
      const result = await pending;

      expect(settled).toBe(true);
      expect(result).toEqual({
        restoredExternalFocus: false,
        demotedOverlayFocus: false,
        externalFocusActive: false,
        canVerifyExternalFocus: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('ignores skipDemotion and still returns blur-only result', async () => {
    const responseWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      isVisible: jest.fn().mockReturnValue(true),
      hide: jest.fn(),
      showInactive: jest.fn(),
      setAlwaysOnTop: jest.fn(),
      moveTop: jest.fn(),
    };
    const chatWindow = {
      isDestroyed: jest.fn().mockReturnValue(false),
      isVisible: jest.fn().mockReturnValue(true),
      hide: jest.fn(),
      showInactive: jest.fn(),
      setAlwaysOnTop: jest.fn(),
      moveTop: jest.fn(),
    };
    const result = await prepareOverlayQueryCaptureFocus({
      responseWindow,
      chatWindow,
      platform: 'linux',
      waitMs: 0,
      skipDemotion: true,
    });

    expect(responseWindow.hide).not.toHaveBeenCalled();
    expect(chatWindow.hide).not.toHaveBeenCalled();
    expect(typeof responseWindow.blur).toBe('undefined');
    expect(typeof chatWindow.blur).toBe('undefined');
    expect(result).toEqual({
      restoredExternalFocus: false,
      demotedOverlayFocus: false,
      externalFocusActive: false,
      canVerifyExternalFocus: false,
    });
  });

  test('skips blur-only capture prep on macOS to avoid overlay handoff flicker', async () => {
    const chatWindow = createFocusableWindow();
    const responseWindow = createFocusableWindow();
    const mainWindow = createFocusableWindow();

    const result = await prepareOverlayQueryCaptureFocus({
      chatWindow,
      responseWindow,
      mainWindow,
      platform: 'darwin',
      waitMs: 25,
    });

    expect(chatWindow.blur).not.toHaveBeenCalled();
    expect(responseWindow.blur).not.toHaveBeenCalled();
    expect(mainWindow.blur).not.toHaveBeenCalled();
    expect(result).toEqual({
      restoredExternalFocus: false,
      demotedOverlayFocus: false,
      externalFocusActive: false,
      canVerifyExternalFocus: false,
    });
  });
});

describe('main_window_runtime createChatWindow', () => {
  function createDeps(overrides = {}) {
    const handlers = {};
    const chatWindow = {
      setAlwaysOnTop: jest.fn(),
      setVisibleOnAllWorkspaces: jest.fn(),
      setIgnoreMouseEvents: jest.fn(),
      setContentProtection: jest.fn(),
      loadURL: jest.fn(),
      loadFile: jest.fn(),
      on: jest.fn((eventName, handler) => {
        handlers[eventName] = handler;
      }),
      isDestroyed: jest.fn().mockReturnValue(false),
    };
    const BrowserWindow = jest.fn(() => chatWindow);
    const deps = {
      BrowserWindow,
      path: require('path'),
      app: { isPackaged: false, isQuitting: false },
      platform: 'linux',
      enableDevTransparencyUi: false,
      positionChatWindow: jest.fn(),
      hideChatWindow: jest.fn(),
      syncWakewordToggleForChatVisibility: jest.fn(),
      setChatWindow: jest.fn(),
      applyOverlayWindowPolicy: jest.fn(),
      applyContentProtection: jest.fn(),
      syncWindowDisplayAffinity: jest.fn(),
      log: jest.fn(),
      ...overrides,
    };
    return { deps, handlers, chatWindow };
  }

  test('disables chat overlay devtools in customer mode', () => {
    const { deps } = createDeps({ enableDevTransparencyUi: false });

    createChatWindow(deps);

    const options = deps.BrowserWindow.mock.calls[0][0];
    expect(options.webPreferences.devTools).toBe(false);
  });

  test('enables chat overlay devtools in dev mode', () => {
    const { deps } = createDeps({ enableDevTransparencyUi: true });

    createChatWindow(deps);

    const options = deps.BrowserWindow.mock.calls[0][0];
    expect(options.webPreferences.devTools).toBe(true);
  });

  test('starts the chat overlay compact and click-through until pill hover', () => {
    const { deps, chatWindow } = createDeps();

    createChatWindow(deps);

    const options = deps.BrowserWindow.mock.calls[0][0];
    expect(options.width).toBe(520);
    expect(options.height).toBe(164);
    expect(options.resizable).toBe(false);
    expect(chatWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
  });

  test('creates chat overlay without creation-time content protection', () => {
    const { deps, chatWindow } = createDeps({ platform: 'win32' });

    createChatWindow(deps);

    expect(deps.applyOverlayWindowPolicy).toHaveBeenCalledWith({
      targetWindow: chatWindow,
      windowLabel: 'chat box',
    });
    expect(deps.applyContentProtection).not.toHaveBeenCalled();
  });

  test('defers chat renderer load until first show event', () => {
    const { deps, handlers, chatWindow } = createDeps();

    createChatWindow(deps);
    expect(chatWindow.loadURL).not.toHaveBeenCalled();
    expect(chatWindow.loadFile).not.toHaveBeenCalled();

    handlers.show();
    expect(chatWindow.loadURL).toHaveBeenCalledTimes(1);
    expect(chatWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('view=minimal-chat-pill'));
    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledWith(chatWindow);
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] shown name=chat-pill');

    handlers.show();
    expect(chatWindow.loadURL).toHaveBeenCalledTimes(1);
  });

  test('syncs chat display affinity on move events', () => {
    const { deps, handlers, chatWindow } = createDeps();

    createChatWindow(deps);
    handlers.move();

    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledWith(chatWindow);
  });

  test('logs chat overlay hide and close lifecycle events', () => {
    const { deps, handlers } = createDeps();
    const closeEvent = { preventDefault: jest.fn() };

    createChatWindow(deps);
    handlers.hide();
    handlers.close(closeEvent);
    handlers.closed();

    expect(deps.log).toHaveBeenCalledWith('[Main][Window] hidden name=chat-pill');
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] close_requested name=chat-pill quitting=false');
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] closed name=chat-pill');
  });

  test('adds debug_stream query flag to chat overlay when stream tracing is enabled', () => {
    const { deps, handlers, chatWindow } = createDeps({
      enableDebugStreamTrace: true,
    });

    createChatWindow(deps);
    handlers.show();

    expect(chatWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('debug_stream=1'));
  });

  test('adds debug_tool_screenshot query flag to chat overlay when tool screenshot tracing is enabled', () => {
    const { deps, handlers, chatWindow } = createDeps({
      enableDebugToolScreenshot: true,
    });

    createChatWindow(deps);
    handlers.show();

    expect(chatWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('debug_tool_screenshot=1'));
  });

  test('applies capturable always-on-top policy on mac for chat overlay', () => {
    const { deps, chatWindow } = createDeps({ platform: 'darwin' });

    createChatWindow(deps);

    expect(deps.applyOverlayWindowPolicy).toHaveBeenCalledWith({
      targetWindow: chatWindow,
      windowLabel: 'chat box',
    });
  });

  test('pins chat overlay across workspaces and fullscreen spaces on mac', () => {
    const { deps, chatWindow } = createDeps({ platform: 'darwin' });

    createChatWindow(deps);

    expect(deps.applyOverlayWindowPolicy).toHaveBeenCalledWith({
      targetWindow: chatWindow,
      windowLabel: 'chat box',
    });
  });
});

describe('main_window_runtime createResponseWindow', () => {
  function createDeps(overrides = {}) {
    const handlers = {};
    const responseWindow = {
      setAlwaysOnTop: jest.fn(),
      setVisibleOnAllWorkspaces: jest.fn(),
      setContentProtection: jest.fn(),
      loadURL: jest.fn(),
      loadFile: jest.fn(),
      hide: jest.fn(),
      setIgnoreMouseEvents: jest.fn(),
      on: jest.fn((eventName, handler) => {
        handlers[eventName] = handler;
      }),
      isDestroyed: jest.fn().mockReturnValue(false),
    };
    const BrowserWindow = jest.fn(() => responseWindow);
    const deps = {
      BrowserWindow,
      path: require('path'),
      app: { isPackaged: false, isQuitting: false },
      platform: 'linux',
      enableDevTransparencyUi: false,
      enableOsToolGhostDebug: false,
      responseWindowDebugView: 'tool-ghost-debug',
      positionResponseWindow: jest.fn(),
      showResponseWindowInactive: jest.fn(),
      setResponseOverlayVisible: jest.fn(),
      setResponseOverlayVisibilityState: jest.fn(),
      setResponseWindow: jest.fn(),
      applyOverlayWindowPolicy: jest.fn(),
      applyContentProtection: jest.fn(),
      syncWindowDisplayAffinity: jest.fn(),
      log: jest.fn(),
      ...overrides,
    };
    return { deps, handlers, responseWindow };
  }

  test('eager-loads response overlay renderer in normal mode so awaiting UI is ready before first show', () => {
    const { deps, handlers, responseWindow } = createDeps({ enableOsToolGhostDebug: false });

    createResponseWindow(deps);
    expect(responseWindow.loadURL).toHaveBeenCalledTimes(1);
    expect(responseWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('view=minimal-response-overlay'));
    expect(responseWindow.loadFile).not.toHaveBeenCalled();

    handlers.show();
    expect(responseWindow.loadURL).toHaveBeenCalledTimes(1);
    expect(deps.syncWindowDisplayAffinity).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] shown name=response-overlay');

    handlers.show();
    expect(responseWindow.loadURL).toHaveBeenCalledTimes(1);
  });

  test('logs response overlay close lifecycle events', () => {
    const { deps, handlers, responseWindow } = createDeps();
    const closeEvent = { preventDefault: jest.fn() };

    createResponseWindow(deps);
    handlers.close(closeEvent);
    handlers.closed();

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(responseWindow.hide).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] close_requested name=response-overlay quitting=false');
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] closed name=response-overlay');
  });

  test('does not sync active display affinity from response overlay move events', () => {
    const { deps, handlers } = createDeps();

    createResponseWindow(deps);
    expect(handlers.move).toBeUndefined();

    expect(deps.syncWindowDisplayAffinity).not.toHaveBeenCalled();
  });

  test('keeps debug response overlay eager-loaded', () => {
    const { deps, responseWindow } = createDeps({ enableOsToolGhostDebug: true });

    createResponseWindow(deps);

    expect(responseWindow.loadURL).toHaveBeenCalledTimes(1);
    expect(responseWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('view=tool-ghost-debug'));
    expect(deps.positionResponseWindow).toHaveBeenCalledTimes(1);
    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
    expect(deps.setResponseOverlayVisible).toHaveBeenCalledWith(true);
  });

  test('starts the response overlay click-through until renderer hover', () => {
    const { deps, responseWindow } = createDeps();

    createResponseWindow(deps);

    expect(responseWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
  });

  test('adds debug_stream query flag to response overlay when stream tracing is enabled', () => {
    const { deps, handlers, responseWindow } = createDeps({
      enableDebugStreamTrace: true,
    });

    createResponseWindow(deps);
    handlers.show();

    expect(responseWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('debug_stream=1'));
  });

  test('adds debug_tool_screenshot query flag to response overlay when tool screenshot tracing is enabled', () => {
    const { deps, handlers, responseWindow } = createDeps({
      enableDebugToolScreenshot: true,
    });

    createResponseWindow(deps);
    handlers.show();

    expect(responseWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('debug_tool_screenshot=1'));
  });

  test('applies capturable always-on-top policy on mac for response overlay', () => {
    const { deps, responseWindow } = createDeps({ platform: 'darwin' });

    createResponseWindow(deps);

    expect(deps.applyOverlayWindowPolicy).toHaveBeenCalledWith({
      targetWindow: responseWindow,
      windowLabel: 'response overlay',
    });
    expect(deps.applyContentProtection).not.toHaveBeenCalled();
  });

  test('pins response overlay across workspaces and fullscreen spaces on mac', () => {
    const { deps, responseWindow } = createDeps({ platform: 'darwin' });

    createResponseWindow(deps);

    expect(deps.applyOverlayWindowPolicy).toHaveBeenCalledWith({
      targetWindow: responseWindow,
      windowLabel: 'response overlay',
    });
  });

});

describe('main_window_runtime createMainWindow', () => {
  function createDeps(overrides = {}) {
    const handlers = {};
    const mainWindow = {
      setContentProtection: jest.fn(),
      setMenuBarVisibility: jest.fn(),
      loadURL: jest.fn(),
      loadFile: jest.fn(),
      hide: jest.fn(),
      setFullScreen: jest.fn(),
      isFullScreen: jest.fn(() => false),
      on: jest.fn((eventName, handler) => {
        handlers[eventName] = handler;
      }),
      once: jest.fn((eventName, handler) => {
        handlers[`once:${eventName}`] = handler;
      }),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        send: jest.fn(),
        isDestroyed: jest.fn().mockReturnValue(false),
      },
    };
    const BrowserWindow = jest.fn(() => mainWindow);
    const deps = {
      BrowserWindow,
      path: require('path'),
      app: { isPackaged: false, isQuitting: false },
      platform: 'linux',
      enableDevTransparencyUi: false,
      ipcMain: { on: jest.fn(), handle: jest.fn() },
      initializeIpc: jest.fn(),
      applyResponseOverlayPhase: jest.fn(),
      setAgentLoopStopShortcutEnabled: jest.fn(),
      prepareOverlayQueryCaptureFocus: jest.fn(),
      syncSdkLiveTurnSurfaceIntent: jest.fn(),
      initializeWakewordBridge: jest.fn(),
      showChatWindow: jest.fn().mockReturnValue({ success: true }),
      emitWakewordSttTrigger: jest.fn(),
      initializeLocalRuntimeBridge: jest.fn(),
      getKnownLocalRuntime: jest.fn(),
      ensureLocalRuntime: jest.fn(),
      bundledRuntimeCopy: {
        missingRuntimeMessage: 'Please reinstall this app',
      },
      runtimePaths: {
        pythonPath: 'AGENT_PYTHON_PATH',
      },
      localRuntimeDaemonEntrypoint: 'local-runtime-daemon.py',
      localRuntimeEnv: {
        backendHttpUrl: 'AGENT_BACKEND_HTTP_URL',
      },
      wakewordEnv: {
        modelName: 'AGENT_WAKEWORD_NAME',
      },
      wakewordModelName: 'desktop_wakeword',
      wakewordStderrLogMarkers: ['desktop_wakeword'],
      localRuntimeBridgeCopy: {
        browserWarmupExplanation: 'Open the desktop browser',
      },
      initializeMainProcessIpc: jest.fn(),
      getWindows: jest.fn(() => ({ mainWindow })),
      getMainWindowMode: jest.fn(() => 'dashboard'),
      setMainWindow: jest.fn(),
      syncWindowDisplayAffinity: jest.fn(),
      log: jest.fn(),
      ...overrides,
    };
    return { deps, BrowserWindow, mainWindow, handlers };
  }

  test('disables dashboard devtools in customer mode', () => {
    const { deps, BrowserWindow } = createDeps({ enableDevTransparencyUi: false });

    createMainWindow(deps);

    const options = BrowserWindow.mock.calls[0][0];
    expect(options.webPreferences.devTools).toBe(false);
    expect(options.webPreferences.additionalArguments).toEqual(
      expect.arrayContaining([
        expect.stringContaining('--desktop-runtime-ipc-channels='),
      ]),
    );
    expect(options.webPreferences.additionalArguments).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('--desktop-' + 'agent-ipc-channels='),
      ]),
    );
  });

  test('enables dashboard devtools in dev mode', () => {
    const { deps, BrowserWindow } = createDeps({ enableDevTransparencyUi: true });

    createMainWindow(deps);

    const options = BrowserWindow.mock.calls[0][0];
    expect(options.webPreferences.devTools).toBe(true);
  });

  test('boots the split main-process IPC registrars during main window startup', () => {
    const { deps } = createDeps();

    createMainWindow(deps);

    expect(deps.initializeMainProcessIpc).toHaveBeenCalledTimes(1);
    expect(deps.initializeIpc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      setAgentLoopStopShortcutEnabled: deps.setAgentLoopStopShortcutEnabled,
      syncSdkLiveTurnSurfaceIntent: deps.syncSdkLiveTurnSurfaceIntent,
      bundledRuntimeCopy: deps.bundledRuntimeCopy,
      runtimePaths: deps.runtimePaths,
      localRuntimeDaemonEntrypoint: 'local-runtime-daemon.py',
      localRuntimeEnv: deps.localRuntimeEnv,
    }));
    expect(deps.initializeWakewordBridge).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      expect.objectContaining({
        ipcMain: deps.ipcMain,
        bundledRuntimeCopy: deps.bundledRuntimeCopy,
        runtimePaths: deps.runtimePaths,
        wakewordEnv: deps.wakewordEnv,
        wakewordModelName: deps.wakewordModelName,
        wakewordStderrLogMarkers: deps.wakewordStderrLogMarkers,
      }),
    );
  });

  test('passes the permission state path into local runtime bridge initialization', () => {
    const { deps } = createDeps({
      permissionStatePath: '/tmp/desktop-runtime-permission-state.json',
    });

    createMainWindow(deps);

    expect(deps.initializeLocalRuntimeBridge).toHaveBeenCalledTimes(1);
    const [getWindows, bridgeOptions] = deps.initializeLocalRuntimeBridge.mock.calls[0];
    expect(typeof getWindows).toBe('function');
    expect(bridgeOptions).toEqual(expect.objectContaining({
      getKnownLocalRuntime: deps.getKnownLocalRuntime,
      ensureLocalRuntime: deps.ensureLocalRuntime,
      isPackaged: false,
      permissionStatePath: '/tmp/desktop-runtime-permission-state.json',
      authStatePath: expect.stringContaining(`${require('path').sep}desktop-runtime${require('path').sep}install-auth.json`),
      localRuntimeBridgeCopy: deps.localRuntimeBridgeCopy,
    }));
    expect(bridgeOptions).not.toHaveProperty('prepareComputerUseSurface');
  });

  test('syncs main window display affinity on show and move events', () => {
    const { deps, handlers, mainWindow } = createDeps();

    createMainWindow(deps);
    handlers.show();
    handlers.move();

    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledWith(mainWindow);
    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledTimes(2);
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] shown name=main');
  });

  test('passes native app icon into dashboard BrowserWindow options when available', () => {
    const { nativeImage } = require('electron');
    const icon = { isEmpty: () => false };
    nativeImage.createFromPath.mockReturnValueOnce(icon);
    const { deps, BrowserWindow } = createDeps({
      resolveAppIconPath: jest.fn(() => '/tmp/agent-icon.png'),
    });

    createMainWindow(deps);

    const options = BrowserWindow.mock.calls[0][0];
    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/agent-icon.png');
    expect(options.icon).toBe(icon);
  });

  test('uses host skin app icon asset filename for default dashboard icon resolution', () => {
    const { nativeImage } = require('electron');
    const fs = require('fs');
    const existsSyncSpy = jest.spyOn(fs, 'existsSync')
      .mockImplementation((candidate) => String(candidate).includes('brand.app.png'));
    const icon = { isEmpty: () => false };
    try {
      nativeImage.createFromPath.mockReturnValueOnce(icon);
      const { deps, BrowserWindow } = createDeps({
        appIconFileName: 'brand.app.png',
      });

      createMainWindow(deps);

      const options = BrowserWindow.mock.calls[0][0];
      expect(nativeImage.createFromPath).toHaveBeenCalledWith(
        expect.stringContaining(`assets${require('path').sep}icons${require('path').sep}brand.app.png`),
      );
      expect(options.icon).toBe(icon);
    } finally {
      existsSyncSpy.mockRestore();
    }
  });

  test('adds vm_mode query flag when VM mode is enabled', () => {
    const { deps, mainWindow } = createDeps({
      vmMode: true,
    });

    createMainWindow(deps);

    expect(mainWindow.loadURL).toHaveBeenCalledTimes(1);
    expect(mainWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('vm_mode=1'));
  });

  test('adds debug_stream query flag to dashboard when stream tracing is enabled', () => {
    const { deps, mainWindow } = createDeps({
      enableDebugStreamTrace: true,
    });

    createMainWindow(deps);

    expect(mainWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('debug_stream=1'));
  });

  test('adds debug_tool_screenshot query flag to dashboard when tool screenshot tracing is enabled', () => {
    const { deps, mainWindow } = createDeps({
      enableDebugToolScreenshot: true,
    });

    createMainWindow(deps);

    expect(mainWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('debug_tool_screenshot=1'));
  });

  test('does not minimize to tray on close when minimizeToTrayOnClose is disabled', () => {
    const { deps, handlers } = createDeps({
      minimizeToTrayOnClose: false,
    });
    const closeEvent = { preventDefault: jest.fn() };

    createMainWindow(deps);
    handlers.close(closeEvent);

    expect(closeEvent.preventDefault).not.toHaveBeenCalled();
    expect(deps.showChatWindow).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] close_requested name=main mode=dashboard minimizing=false');
  });

  test('logs main window close and closed lifecycle events', () => {
    const { deps, handlers, mainWindow } = createDeps();
    const closeEvent = { preventDefault: jest.fn() };

    createMainWindow(deps);
    handlers.close(closeEvent);
    handlers.closed();

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(mainWindow.hide).toHaveBeenCalledTimes(1);
    expect(deps.showChatWindow).toHaveBeenCalledWith({ focus: true, reason: 'dashboard-close' });
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] close_requested name=main mode=dashboard minimizing=true');
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] closed name=main');
  });

  test('exits macOS fullscreen before hiding the dashboard on close', () => {
    const { deps, handlers, mainWindow } = createDeps({
      platform: 'darwin',
    });
    mainWindow.isFullScreen.mockReturnValue(true);
    const closeEvent = { preventDefault: jest.fn() };

    createMainWindow(deps);
    handlers.close(closeEvent);

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(mainWindow.setFullScreen).toHaveBeenCalledWith(false);
    expect(mainWindow.hide).not.toHaveBeenCalled();
    expect(deps.showChatWindow).not.toHaveBeenCalled();

    handlers['once:leave-full-screen']();

    expect(mainWindow.hide).toHaveBeenCalledTimes(1);
    expect(deps.showChatWindow).toHaveBeenCalledWith({ focus: true, reason: 'dashboard-close' });
  });

  test('falls back when macOS never reports leaving fullscreen', () => {
    jest.useFakeTimers();
    try {
      const { deps, handlers, mainWindow } = createDeps({
        platform: 'darwin',
      });
      mainWindow.isFullScreen.mockReturnValue(true);
      const closeEvent = { preventDefault: jest.fn() };

      createMainWindow(deps);
      handlers.close(closeEvent);

      expect(mainWindow.setFullScreen).toHaveBeenCalledWith(false);
      expect(mainWindow.hide).not.toHaveBeenCalled();
      expect(mainWindow.__desktopRuntimePendingCollapseToChatPill).toBe(true);

      jest.advanceTimersByTime(1500);

      expect(mainWindow.hide).toHaveBeenCalledTimes(1);
      expect(deps.showChatWindow).toHaveBeenCalledWith({ focus: true, reason: 'dashboard-close' });
      expect(mainWindow.__desktopRuntimePendingCollapseToChatPill).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('hides onboarding without restoring the chat pill on close', () => {
    const { deps, handlers, mainWindow } = createDeps({
      platform: 'darwin',
      getMainWindowMode: jest.fn(() => 'onboarding'),
    });
    const closeEvent = { preventDefault: jest.fn() };

    createMainWindow(deps);
    handlers.close(closeEvent);

    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(mainWindow.hide).toHaveBeenCalledTimes(1);
    expect(mainWindow.setFullScreen).not.toHaveBeenCalled();
    expect(deps.showChatWindow).not.toHaveBeenCalled();
  });
});

describe('main_window_runtime createTray', () => {
  function createTrayDeps(overrides = {}) {
    const tray = {
      setToolTip: jest.fn(),
      setContextMenu: jest.fn(),
      on: jest.fn(),
    };
    return {
      deps: {
        Tray: jest.fn(() => tray),
        Menu: {
          buildFromTemplate: jest.fn(() => ({ menu: true })),
        },
        showMainWindow: jest.fn(),
        app: { quit: jest.fn(), isQuitting: false },
        resolveTrayIconPath: jest.fn(() => '/tmp/agent-icon.png'),
        warn: jest.fn(),
        ...overrides,
      },
      tray,
    };
  }

  test('loads tray icon from resolved path and sets configured tooltip', () => {
    const { nativeImage } = require('electron');
    const icon = { isEmpty: () => false };
    nativeImage.createFromPath.mockReturnValueOnce(icon);

    const { deps, tray } = createTrayDeps({
      trayTooltip: 'Sample Desktop',
    });
    createTray(deps);

    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/agent-icon.png');
    expect(deps.Tray).toHaveBeenCalledWith(icon);
    expect(tray.setToolTip).toHaveBeenCalledWith('Sample Desktop');
  });

  test('falls back to data-url tray icon when path icon is empty', () => {
    const { nativeImage } = require('electron');
    nativeImage.createFromPath.mockReturnValueOnce({ isEmpty: () => true });

    const { deps } = createTrayDeps();
    createTray(deps);

    expect(nativeImage.createFromDataURL).toHaveBeenCalledTimes(1);
    expect(deps.warn).toHaveBeenCalled();
  });
});
