/** @jest-environment node */

jest.mock('electron', () => ({
  nativeImage: {
    createFromPath: jest.fn(() => ({ isEmpty: () => false })),
    createFromDataURL: jest.fn(() => ({ isEmpty: () => false })),
  },
}));

const {
  collapseMainWindowToChatPill,
  createMainWindow,
  createChatWindow,
  createResponseWindow,
  createTray,
  enableContentProtectionSafely,
  hideMainWindowWithoutChatPill,
  prepareOverlayQueryCaptureFocus,
} = require('../../frontend/src/main/main_window_runtime.cjs');

describe('main_window_runtime enableContentProtectionSafely', () => {
  test('enables content protection on Windows', () => {
    const targetWindow = {
      setContentProtection: jest.fn(),
    };

    enableContentProtectionSafely({
      targetWindow,
      platform: 'win32',
      windowLabel: 'chat box',
    });

    expect(targetWindow.setContentProtection).toHaveBeenCalledWith(true);
  });

  test('can disable content protection on Windows', () => {
    const targetWindow = {
      setContentProtection: jest.fn(),
    };

    enableContentProtectionSafely({
      targetWindow,
      platform: 'win32',
      windowLabel: 'chat box',
      enabled: false,
    });

    expect(targetWindow.setContentProtection).toHaveBeenCalledWith(false);
  });

  test('skips content protection on Linux', () => {
    const targetWindow = {
      setContentProtection: jest.fn(),
    };

    enableContentProtectionSafely({
      targetWindow,
      platform: 'linux',
      windowLabel: 'chat box',
    });

    expect(targetWindow.setContentProtection).not.toHaveBeenCalled();
  });

  test('warns when content protection API is unavailable', () => {
    const warn = jest.fn();

    enableContentProtectionSafely({
      targetWindow: {},
      platform: 'win32',
      windowLabel: 'chat box',
      warn,
    });

    expect(warn).toHaveBeenCalledWith(
      '[Main] Cannot enable chat box content protection: BrowserWindow.setContentProtection is unavailable.',
    );
  });
});

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
      overlayContentProtectionEnabled: false,
      syncWindowDisplayAffinity: jest.fn(),
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

  test('uses a preallocated chat overlay height so multiline growth does not resize the native window', () => {
    const { deps } = createDeps();

    createChatWindow(deps);

    const options = deps.BrowserWindow.mock.calls[0][0];
    expect(options.width).toBe(520);
    expect(options.height).toBe(220);
    expect(options.resizable).toBe(false);
  });

  test('leaves chat overlay unprotected while idle by default', () => {
    const { deps, chatWindow } = createDeps({ platform: 'win32' });

    createChatWindow(deps);

    expect(deps.applyOverlayWindowPolicy).toHaveBeenCalledWith({
      targetWindow: chatWindow,
      windowLabel: 'chat box',
    });
    expect(deps.applyContentProtection).toHaveBeenCalledWith({
      targetWindow: chatWindow,
      windowLabel: 'chat box',
      enabled: false,
    });
  });

  test('enables chat overlay content protection when created during active loop', () => {
    const { deps, chatWindow } = createDeps({
      platform: 'win32',
      overlayContentProtectionEnabled: true,
    });

    createChatWindow(deps);

    expect(deps.applyContentProtection).toHaveBeenCalledWith({
      targetWindow: chatWindow,
      windowLabel: 'chat box',
      enabled: true,
    });
  });

  test('defers chat renderer load until first show event', () => {
    const { deps, handlers, chatWindow } = createDeps();

    createChatWindow(deps);
    expect(chatWindow.loadURL).not.toHaveBeenCalled();
    expect(chatWindow.loadFile).not.toHaveBeenCalled();

    handlers.show();
    expect(chatWindow.loadURL).toHaveBeenCalledTimes(1);
    expect(chatWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('view=chatbox'));
    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledWith(chatWindow);

    handlers.show();
    expect(chatWindow.loadURL).toHaveBeenCalledTimes(1);
  });

  test('syncs chat display affinity on move events', () => {
    const { deps, handlers, chatWindow } = createDeps();

    createChatWindow(deps);
    handlers.move();

    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledWith(chatWindow);
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

  test('uses aggressive always-on-top level on mac for chat overlay', () => {
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
      responseWindowDebugView: 'chatbox-response-debug',
      positionResponseWindow: jest.fn(),
      showResponseWindowInactive: jest.fn(),
      setResponseOverlayVisible: jest.fn(),
      setResponseOverlayVisibilityState: jest.fn(),
      syncContextLabelWindowVisibility: jest.fn(),
      setResponseWindow: jest.fn(),
      applyOverlayWindowPolicy: jest.fn(),
      applyContentProtection: jest.fn(),
      overlayContentProtectionEnabled: false,
      syncWindowDisplayAffinity: jest.fn(),
      ...overrides,
    };
    return { deps, handlers, responseWindow };
  }

  test('eager-loads response overlay renderer in normal mode so awaiting UI is ready before first show', () => {
    const { deps, handlers, responseWindow } = createDeps({ enableOsToolGhostDebug: false });

    createResponseWindow(deps);
    expect(responseWindow.loadURL).toHaveBeenCalledTimes(1);
    expect(responseWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('view=chatbox-response'));
    expect(responseWindow.loadFile).not.toHaveBeenCalled();

    handlers.show();
    expect(responseWindow.loadURL).toHaveBeenCalledTimes(1);
    expect(deps.syncWindowDisplayAffinity).not.toHaveBeenCalled();

    handlers.show();
    expect(responseWindow.loadURL).toHaveBeenCalledTimes(1);
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
    expect(responseWindow.loadURL).toHaveBeenCalledWith(expect.stringContaining('view=chatbox-response-debug'));
    expect(deps.positionResponseWindow).toHaveBeenCalledTimes(1);
    expect(deps.showResponseWindowInactive).toHaveBeenCalledTimes(1);
    expect(deps.setResponseOverlayVisible).toHaveBeenCalledWith(true);
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

  test('uses aggressive always-on-top level on mac for response overlay', () => {
    const { deps, responseWindow } = createDeps({ platform: 'darwin' });

    createResponseWindow(deps);

    expect(deps.applyOverlayWindowPolicy).toHaveBeenCalledWith({
      targetWindow: responseWindow,
      windowLabel: 'response overlay',
    });
    expect(deps.applyContentProtection).toHaveBeenCalledWith({
      targetWindow: responseWindow,
      windowLabel: 'response overlay',
      enabled: false,
    });
  });

  test('pins response overlay across workspaces and fullscreen spaces on mac', () => {
    const { deps, responseWindow } = createDeps({ platform: 'darwin' });

    createResponseWindow(deps);

    expect(deps.applyOverlayWindowPolicy).toHaveBeenCalledWith({
      targetWindow: responseWindow,
      windowLabel: 'response overlay',
    });
  });

  test('enables response overlay content protection when created during active loop', () => {
    const { deps, responseWindow } = createDeps({
      platform: 'darwin',
      overlayContentProtectionEnabled: true,
    });

    createResponseWindow(deps);

    expect(deps.applyContentProtection).toHaveBeenCalledWith({
      targetWindow: responseWindow,
      windowLabel: 'response overlay',
      enabled: true,
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
      initializeIpc: jest.fn(),
      applyResponseOverlayPhase: jest.fn(),
      setAgentLoopStopShortcutEnabled: jest.fn(),
      prepareOverlayQueryCaptureFocus: jest.fn(),
      initializeWakewordBridge: jest.fn(),
      showChatWindow: jest.fn().mockReturnValue({ success: true }),
      emitWakewordSttTrigger: jest.fn(),
      initializeLocalBackendBridge: jest.fn(),
      initializeMainProcessIpc: jest.fn(),
      getLatestFrontendConfig: jest.fn(),
      getWindows: jest.fn(() => ({ mainWindow })),
      getMainWindowMode: jest.fn(() => 'dashboard'),
      setMainWindow: jest.fn(),
      enableContentProtectionSafely: jest.fn(),
      syncWindowDisplayAffinity: jest.fn(),
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
        expect.stringContaining('--windie-ipc-channels='),
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
    }));
  });

  test('passes the permission state path into local backend initialization', () => {
    const { deps } = createDeps({
      permissionStatePath: '/tmp/windieos-permission-state.json',
    });

    createMainWindow(deps);

    expect(deps.initializeLocalBackendBridge).toHaveBeenCalledWith(expect.any(Function), {
      getFrontendConfig: deps.getLatestFrontendConfig,
      isPackaged: false,
      permissionStatePath: '/tmp/windieos-permission-state.json',
    });
  });

  test('syncs main window display affinity on show and move events', () => {
    const { deps, handlers, mainWindow } = createDeps();

    createMainWindow(deps);
    handlers.show();
    handlers.move();

    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledWith(mainWindow);
    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledTimes(2);
  });

  test('keeps dashboard visible in system screenshots', () => {
    const { deps } = createDeps({ platform: 'win32' });

    createMainWindow(deps);

    expect(deps.enableContentProtectionSafely).not.toHaveBeenCalled();
  });

  test('passes native app icon into dashboard BrowserWindow options when available', () => {
    const { nativeImage } = require('electron');
    const icon = { isEmpty: () => false };
    nativeImage.createFromPath.mockReturnValueOnce(icon);
    const { deps, BrowserWindow } = createDeps({
      resolveAppIconPath: jest.fn(() => '/tmp/windieos.png'),
    });

    createMainWindow(deps);

    const options = BrowserWindow.mock.calls[0][0];
    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/windieos.png');
    expect(options.icon).toBe(icon);
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
    expect(deps.showChatWindow).toHaveBeenCalledWith({ focus: true });
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

describe('main_window_runtime collapseMainWindowToChatPill', () => {
  test('collapses immediately when the dashboard is not in macOS fullscreen', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      hide: jest.fn(),
      isFullScreen: jest.fn(() => false),
    };
    const showChatWindow = jest.fn();

    collapseMainWindowToChatPill({
      mainWindow,
      showChatWindow,
      platform: 'darwin',
    });

    expect(mainWindow.hide).toHaveBeenCalledTimes(1);
    expect(showChatWindow).toHaveBeenCalledWith({ focus: true });
  });
});

describe('main_window_runtime hideMainWindowWithoutChatPill', () => {
  test('hides immediately when onboarding closes', () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      hide: jest.fn(),
    };

    hideMainWindowWithoutChatPill({
      mainWindow,
    });

    expect(mainWindow.hide).toHaveBeenCalledTimes(1);
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
        resolveTrayIconPath: jest.fn(() => '/tmp/windieos.png'),
        warn: jest.fn(),
        ...overrides,
      },
      tray,
    };
  }

  test('loads tray icon from resolved path and sets WindieOS tooltip', () => {
    const { nativeImage } = require('electron');
    const icon = { isEmpty: () => false };
    nativeImage.createFromPath.mockReturnValueOnce(icon);

    const { deps, tray } = createTrayDeps();
    createTray(deps);

    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/tmp/windieos.png');
    expect(deps.Tray).toHaveBeenCalledWith(icon);
    expect(tray.setToolTip).toHaveBeenCalledWith('WindieOS');
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
