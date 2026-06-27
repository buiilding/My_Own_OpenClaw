/** @jest-environment node */

const {
  initializeMainProcessLifecycleRuntime,
} = require('../../src/main/app/main_process_lifecycle_runtime.cjs');

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createRuntimeDeps(overrides = {}) {
  const appEvents = {};
  const app = {
    isQuitting: false,
    requestSingleInstanceLock: jest.fn(() => true),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn((eventName, handler) => {
      appEvents[eventName] = handler;
    }),
    quit: jest.fn(),
  };

  const deps = {
    app,
    BrowserWindow: { getAllWindows: jest.fn(() => []) },
    globalShortcut: {
      register: jest.fn(() => true),
      unregisterAll: jest.fn(),
    },
    screen: {
      on: jest.fn(),
    },
    registerRendererWindow: jest.fn(),
    platform: 'linux',
    wakewordHotkey: 'Super+Alt+W',
    wakewordFallbackHotkeys: [],
    createWindow: jest.fn(),
    createChatWindow: jest.fn(),
    createResponseWindow: jest.fn(),
    createTray: jest.fn(),
    syncWakewordToggleForChatVisibility: jest.fn(),
    positionChatWindow: jest.fn(),
    positionResponseWindow: jest.fn(),
    hideChatWindow: jest.fn(),
    showChatWindow: jest.fn(),
    showMainWindow: jest.fn(),
    getMainWindow: jest.fn(() => null),
    getChatWindow: jest.fn(() => null),
    getResponseWindow: jest.fn(() => null),
    syncWindowDisplayAffinity: jest.fn(),
    stopLocalRuntime: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    appendDesktopStartupDiagnostic: jest.fn(),
    scheduleTimeout: jest.fn(() => 0),
    ...overrides,
  };

  return {
    deps,
    appEvents,
    app,
  };
}

describe('main_process_lifecycle_runtime single-instance behavior', () => {
  test('quits duplicate process when single-instance lock is unavailable', async () => {
    const { deps, app, appEvents } = createRuntimeDeps({
      requestSingleInstanceLock: jest.fn(() => false),
      quitApp: jest.fn(() => app.quit()),
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(deps.requestSingleInstanceLock).toHaveBeenCalledTimes(1);
    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(app.whenReady).not.toHaveBeenCalled();
    expect(deps.createWindow).not.toHaveBeenCalled();
    expect(appEvents['second-instance']).toBeUndefined();
    expect(deps.appendDesktopStartupDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'single_instance_lock',
      singleInstanceLockAcquired: false,
      duplicateInstance: true,
    }));
  });

  test('focuses existing window when a second instance is launched', async () => {
    const { deps, appEvents } = createRuntimeDeps();

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(typeof appEvents['second-instance']).toBe('function');
    appEvents['second-instance']();
    expect(deps.log).not.toHaveBeenCalledWith(
      expect.stringContaining('[Main][StartupMetrics] second-instance event received'),
    );
    expect(deps.appendDesktopStartupDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'second_instance',
      duplicateInstance: true,
      focus: true,
      suppressed: false,
    }));
    expect(deps.showChatWindow).toHaveBeenCalledWith({ focus: true, reason: 'app-activate' });
  });

  test('throttles rapid second-instance focus storms to prevent focus stealing loops', async () => {
    const now = jest
      .fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_200)
      .mockReturnValueOnce(1_300)
      .mockReturnValueOnce(2_500);
    const { deps, appEvents } = createRuntimeDeps({ now });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(typeof appEvents['second-instance']).toBe('function');
    appEvents['second-instance']();
    appEvents['second-instance']();
    appEvents['second-instance']();
    appEvents['second-instance']();

    expect(deps.showChatWindow).toHaveBeenCalledTimes(2);
    expect(deps.showChatWindow).toHaveBeenNthCalledWith(1, { focus: true, reason: 'app-activate' }); // first second-instance
    expect(deps.showChatWindow).toHaveBeenNthCalledWith(2, { focus: true, reason: 'app-activate' }); // post-throttle second-instance
    expect(deps.log).not.toHaveBeenCalledWith(
      expect.stringContaining('[Main][StartupMetrics] second-instance event throttled'),
    );
    expect(deps.appendDesktopStartupDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'second_instance',
      duplicateInstance: true,
      suppressed: true,
      reason: 'focus-cooldown',
    }));
  });

  test('supports disabling second-instance throttle via zero cooldown override', async () => {
    const now = jest
      .fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100)
      .mockReturnValueOnce(1_200);
    const { deps, appEvents } = createRuntimeDeps({
      now,
      secondInstanceFocusCooldownMs: 0,
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    appEvents['second-instance']();
    appEvents['second-instance']();
    appEvents['second-instance']();

    expect(deps.showChatWindow).toHaveBeenCalledTimes(3);
    expect(deps.appendDesktopStartupDiagnostic).not.toHaveBeenCalledWith(expect.objectContaining({
      action: 'second_instance',
      suppressed: true,
      reason: 'focus-cooldown',
    }));
  });

  test('falls back to the default second-instance throttle for invalid cooldown overrides', async () => {
    const now = jest
      .fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100);
    const { deps, appEvents } = createRuntimeDeps({
      now,
      secondInstanceFocusCooldownMs: '1000ms',
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    appEvents['second-instance']();
    appEvents['second-instance']();

    expect(deps.showChatWindow).toHaveBeenCalledTimes(1);
    expect(deps.appendDesktopStartupDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'second_instance',
      suppressed: true,
      reason: 'focus-cooldown',
    }));
  });

  test('starts windows and tray once app becomes ready', async () => {
    const { deps } = createRuntimeDeps();

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(deps.createWindow).toHaveBeenCalledTimes(1);
    expect(deps.createChatWindow).toHaveBeenCalledTimes(1);
    expect(deps.createResponseWindow).toHaveBeenCalledTimes(1);
    expect(deps.createTray).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('[Main][App] ready'));
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] created name=main');
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] created name=chat-pill');
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] created name=response-overlay');
    expect(deps.log).toHaveBeenCalledWith('[Main][Tray] created');
    expect(deps.log).toHaveBeenCalledWith('[Main][Renderer] overlay_windows_registered count=2');
    expect(deps.log).toHaveBeenCalledWith('[Main][Shortcut] registered accelerator=Super+Alt+W');
    expect(deps.showMainWindow).not.toHaveBeenCalled();
    expect(deps.syncWakewordToggleForChatVisibility).toHaveBeenCalledTimes(1);
    expect(deps.globalShortcut.register).toHaveBeenCalledWith(
      'Super+Alt+W',
      expect.any(Function),
    );
    expect(deps.screen.on).toHaveBeenCalledWith(
      'display-metrics-changed',
      expect.any(Function),
    );
  });

  test('refreshes active display affinity from the visible chat surface before repositioning on display changes', async () => {
    const chatWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
    };
    const { deps } = createRuntimeDeps({
      getChatWindow: jest.fn(() => chatWindow),
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    const displayMetricsHandler = deps.screen.on.mock.calls.find(
      ([eventName]) => eventName === 'display-metrics-changed',
    )[1];
    displayMetricsHandler();

    expect(deps.log).toHaveBeenCalledWith('[Main][Display] metrics_changed');
    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledTimes(1);
    expect(deps.syncWindowDisplayAffinity.mock.calls[0][0]).toBe(deps.screen);
    expect(deps.syncWindowDisplayAffinity.mock.calls[0][1]).toBe(chatWindow);
    expect(deps.syncWindowDisplayAffinity.mock.calls[0][2]).toEqual({ requireVisible: true });
    expect(deps.positionChatWindow).toHaveBeenCalledTimes(1);
    expect(deps.positionResponseWindow).toHaveBeenCalledTimes(1);
  });

  test('refreshes active display affinity from the visible dashboard when the chat surface is hidden', async () => {
    const mainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
    };
    const hiddenChatWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
    };
    const { deps } = createRuntimeDeps({
      getMainWindow: jest.fn(() => mainWindow),
      getChatWindow: jest.fn(() => hiddenChatWindow),
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    const displayMetricsHandler = deps.screen.on.mock.calls.find(
      ([eventName]) => eventName === 'display-metrics-changed',
    )[1];
    displayMetricsHandler();

    expect(deps.syncWindowDisplayAffinity).toHaveBeenCalledTimes(2);
    expect(deps.syncWindowDisplayAffinity.mock.calls[0][0]).toBe(deps.screen);
    expect(deps.syncWindowDisplayAffinity.mock.calls[0][1]).toBe(hiddenChatWindow);
    expect(deps.syncWindowDisplayAffinity.mock.calls[0][2]).toEqual({ requireVisible: true });
    expect(deps.syncWindowDisplayAffinity.mock.calls[1][0]).toBe(deps.screen);
    expect(deps.syncWindowDisplayAffinity.mock.calls[1][1]).toBe(mainWindow);
    expect(deps.syncWindowDisplayAffinity.mock.calls[1][2]).toEqual({ requireVisible: true });
    expect(deps.positionChatWindow).toHaveBeenCalledTimes(1);
    expect(deps.positionResponseWindow).toHaveBeenCalledTimes(1);
  });

  test('registers fallback hotkey on Windows when primary is unavailable', async () => {
    const register = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { deps } = createRuntimeDeps({
      platform: 'win32',
      wakewordHotkey: 'Super+Alt+W',
      wakewordFallbackHotkeys: ['CommandOrControl+Alt+W'],
      globalShortcut: {
        register,
        unregisterAll: jest.fn(),
      },
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(register).toHaveBeenNthCalledWith(1, 'Super+Alt+W', expect.any(Function));
    expect(register).toHaveBeenNthCalledWith(2, 'CommandOrControl+Alt+W', expect.any(Function));
    expect(deps.warn).toHaveBeenCalledWith(
      '[Main] Registered fallback global shortcut: CommandOrControl+Alt+W (primary Super+Alt+W unavailable)',
    );
  });

  test('warns when no wakeword global shortcut can be registered', async () => {
    const register = jest.fn(() => false);
    const { deps } = createRuntimeDeps({
      platform: 'win32',
      wakewordHotkey: 'Super+Alt+W',
      wakewordFallbackHotkeys: [
        'CommandOrControl+Alt+W',
        'CommandOrControl+Shift+W',
        'CommandOrControl+Alt+J',
      ],
      globalShortcut: {
        register,
        unregisterAll: jest.fn(),
      },
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(register).toHaveBeenCalledTimes(4);
    expect(deps.warn).toHaveBeenCalledWith(
      '[Main] Failed to register global shortcut. Tried: Super+Alt+W, CommandOrControl+Alt+W, CommandOrControl+Shift+W, CommandOrControl+Alt+J',
    );
  });

  test('logs startup memory snapshots and schedules delayed sample', async () => {
    const getPid = jest.fn(() => 4242);
    const getProcessMemoryUsage = jest.fn(() => ({
      rss: 220 * 1024 * 1024,
      heapUsed: 80 * 1024 * 1024,
    }));
    const getAppMetrics = jest.fn(() => ([
      { type: 'Browser', memory: { workingSetSize: 110 * 1024 * 1024 } },
      { type: 'Tab', memory: { workingSetSize: 70 * 1024 * 1024 } },
      { type: 'GPU', memory: { workingSetSize: 40 * 1024 * 1024 } },
    ]));
    const scheduleTimeout = jest.fn((fn) => {
      fn();
      return 1;
    });
    const { deps } = createRuntimeDeps({
      getPid,
      getProcessMemoryUsage,
      getAppMetrics,
      scheduleTimeout,
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
    expect(deps.log).not.toHaveBeenCalledWith(expect.stringContaining('[Main][StartupMetrics]'));
    expect(deps.appendDesktopStartupDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'metrics_snapshot',
      label: 'startup-ready',
      pid: 4242,
      appProcessCount: 3,
      rendererProcessCount: 1,
      appWorkingSetMb: 220,
    }));
    expect(deps.appendDesktopStartupDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'metrics_snapshot',
      label: 'startup-ready+2000ms',
      pid: 4242,
      appProcessCount: 3,
    }));
  });

  test('only prevents window-all-closed in tray mode (not during app quit)', async () => {
    const { deps, app, appEvents } = createRuntimeDeps();

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    const handler = appEvents['window-all-closed'];
    expect(typeof handler).toBe('function');

    const trayModeEvent = { preventDefault: jest.fn() };
    handler(trayModeEvent);
    expect(trayModeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] all_closed quitting=false vm_mode=false');

    app.isQuitting = true;
    const quittingEvent = { preventDefault: jest.fn() };
    handler(quittingEvent);
    expect(quittingEvent.preventDefault).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('[Main][Window] all_closed quitting=true vm_mode=false');
  });

  test('logs app shutdown phases and stops local runtime services', async () => {
    const { deps, app, appEvents } = createRuntimeDeps();

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    appEvents['before-quit']();
    appEvents['will-quit']();

    expect(app.isQuitting).toBe(true);
    expect(deps.log).toHaveBeenCalledWith('[Main][Shutdown] before_quit cleanup=local-runtime,vm-worker');
    expect(deps.log).toHaveBeenCalledWith('[Main][Shutdown] will_quit unregister_global_shortcuts');
    expect(deps.stopLocalRuntime).toHaveBeenCalledTimes(1);
    expect(deps.globalShortcut.unregisterAll).toHaveBeenCalledTimes(1);
  });

  test('vm mode starts only main window and skips tray/overlay/hotkey wiring', async () => {
    const { deps } = createRuntimeDeps({
      vmMode: true,
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(deps.createWindow).toHaveBeenCalledTimes(1);
    expect(deps.createChatWindow).not.toHaveBeenCalled();
    expect(deps.createResponseWindow).not.toHaveBeenCalled();
    expect(deps.createTray).not.toHaveBeenCalled();
    expect(deps.showMainWindow).toHaveBeenCalledWith({ focus: true, reason: 'startup-vm' });
    expect(deps.syncWakewordToggleForChatVisibility).not.toHaveBeenCalled();
    expect(deps.globalShortcut.register).not.toHaveBeenCalled();
    expect(deps.screen.on).not.toHaveBeenCalled();
  });

  test('second-instance focuses the main window when onboarding/dashboard is already visible', async () => {
    const visibleMainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => true),
    };
    const { deps, appEvents } = createRuntimeDeps({
      getMainWindow: jest.fn(() => visibleMainWindow),
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    appEvents['second-instance']();

    expect(deps.showMainWindow).toHaveBeenCalledWith({ focus: true, reason: 'app-activate-main-visible' });
    expect(deps.showChatWindow).not.toHaveBeenCalled();
  });

  test('activate focuses the chat pill when the dashboard is hidden', async () => {
    const visibleWindows = [{ id: 'hidden-main' }];
    const hiddenMainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
    };
    const { deps, appEvents } = createRuntimeDeps({
      BrowserWindow: { getAllWindows: jest.fn(() => visibleWindows) },
      getMainWindow: jest.fn(() => hiddenMainWindow),
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    appEvents.activate();

    expect(deps.log).toHaveBeenCalledWith('[Main][App] activate window_count=1');
    expect(deps.showChatWindow).toHaveBeenCalledWith({ focus: true, reason: 'app-activate' });
    expect(deps.showMainWindow).not.toHaveBeenCalled();
  });

  test('activate opens the dashboard when the chat pill is user-hidden', async () => {
    const visibleWindows = [{ id: 'hidden-main' }];
    const hiddenMainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
    };
    const { deps, appEvents } = createRuntimeDeps({
      BrowserWindow: { getAllWindows: jest.fn(() => visibleWindows) },
      getMainWindow: jest.fn(() => hiddenMainWindow),
      showChatWindow: jest.fn(() => ({
        success: true,
        suppressed: true,
        reason: 'chat-pill-user-hidden',
      })),
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    appEvents.activate();

    expect(deps.showChatWindow).toHaveBeenCalledWith({ focus: true, reason: 'app-activate' });
    expect(deps.showMainWindow).toHaveBeenCalledWith({
      focus: true,
      reason: 'app-activate-chat-pill-hidden',
    });
  });

  test('activate restores onboarding in the main window when onboarding was hidden', async () => {
    const visibleWindows = [{ id: 'hidden-main' }];
    const hiddenMainWindow = {
      isDestroyed: jest.fn(() => false),
      isVisible: jest.fn(() => false),
    };
    const { deps, appEvents } = createRuntimeDeps({
      BrowserWindow: { getAllWindows: jest.fn(() => visibleWindows) },
      getMainWindow: jest.fn(() => hiddenMainWindow),
      getPrimarySurface: jest.fn(() => 'onboarding'),
      getMainWindowMode: jest.fn(() => 'onboarding'),
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    appEvents.activate();

    expect(deps.showMainWindow).toHaveBeenCalledWith({
      focus: true,
      open: 'onboarding',
      reason: 'app-activate-onboarding',
    });
    expect(deps.showChatWindow).not.toHaveBeenCalled();
  });

  test('vm mode does not prevent window-all-closed default behavior', async () => {
    const { deps, appEvents } = createRuntimeDeps({
      vmMode: true,
    });

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    const handler = appEvents['window-all-closed'];
    expect(typeof handler).toBe('function');

    const event = { preventDefault: jest.fn() };
    handler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
