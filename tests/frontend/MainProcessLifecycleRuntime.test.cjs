/** @jest-environment node */

const {
  initializeMainProcessLifecycleRuntime,
} = require('../../frontend/src/main/main_process_lifecycle_runtime.cjs');

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
    wakewordHotkey: 'Super+Alt+W',
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
    getChatWindow: jest.fn(() => null),
    getResponseWindow: jest.fn(() => null),
    stopLocalBackend: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
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
  });

  test('focuses existing window when a second instance is launched', async () => {
    const { deps, appEvents } = createRuntimeDeps();

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(typeof appEvents['second-instance']).toBe('function');
    appEvents['second-instance']();
    expect(deps.log).toHaveBeenCalledWith(
      '[Main][StartupMetrics] second-instance event received; focusing existing window.',
    );
    expect(deps.showMainWindow).toHaveBeenCalledWith({ focus: true });
  });

  test('starts windows and tray once app becomes ready', async () => {
    const { deps } = createRuntimeDeps();

    initializeMainProcessLifecycleRuntime(deps);
    await flushPromises();

    expect(deps.createWindow).toHaveBeenCalledTimes(1);
    expect(deps.createChatWindow).toHaveBeenCalledTimes(1);
    expect(deps.createResponseWindow).toHaveBeenCalledTimes(1);
    expect(deps.createTray).toHaveBeenCalledTimes(1);
    expect(deps.showMainWindow).toHaveBeenCalledWith({ focus: true });
    expect(deps.syncWakewordToggleForChatVisibility).toHaveBeenCalledTimes(1);
    expect(deps.screen.on).toHaveBeenCalledWith(
      'display-metrics-changed',
      expect.any(Function),
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
    const startupMetricLines = deps.log.mock.calls
      .map(([line]) => line)
      .filter((line) => String(line).includes('[Main][StartupMetrics] startup-ready'));
    expect(startupMetricLines).toHaveLength(2);
    expect(startupMetricLines[0]).toContain('pid=4242');
    expect(startupMetricLines[0]).toContain('app_processes=3');
    expect(startupMetricLines[0]).toContain('renderer=1');
    expect(startupMetricLines[0]).toContain('app_working_set_mb=220');
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

    app.isQuitting = true;
    const quittingEvent = { preventDefault: jest.fn() };
    handler(quittingEvent);
    expect(quittingEvent.preventDefault).not.toHaveBeenCalled();
  });
});
