/**
 * Covers desktop UI config IPC handler behavior in the frontend test suite.
 */

const fs = require('fs/promises');
const path = require('path');

const {
  createDesktopUiConfigHandlersRuntime,
  registerDesktopUiConfigHandlers,
} = require('../../frontend/src/main/ipc/ipc_desktop_ui_config_handlers.cjs');

function createHarness(overrides = {}) {
  const handlers = {};
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
  };
  const latest = { current: overrides.initialLatest || null };
  const setGlobalAgentStopShortcutAccelerator = jest.fn();
  registerDesktopUiConfigHandlers({
    ipcMain,
    loadCachedDesktopUiConfigFromDisk: jest.fn(async () => overrides.loadResult),
    persistDesktopUiConfigToDisk: jest.fn(async (config) => ({ success: true, config })),
    isValidConfigPayload: (config) => (
      Boolean(config) && typeof config === 'object' && !Array.isArray(config)
    ),
    applyShortcutStatusFallbackToConfig: (config) => ({
      ...config,
      global_agent_stop_shortcut: config.global_agent_stop_shortcut || 'CommandOrControl+Shift+Escape',
    }),
    getLatestDesktopUiConfig: () => latest.current,
    setLatestDesktopUiConfig: (config) => {
      latest.current = config;
    },
    setGlobalAgentStopShortcutAccelerator,
    ...overrides.runtime,
  });
  return {
    handlers,
    ipcMain,
    latest,
    setGlobalAgentStopShortcutAccelerator,
  };
}

describe('desktop UI config IPC handlers', () => {
  test('load handler applies shortcut fallback and updates latest config', async () => {
    const { handlers, latest, setGlobalAgentStopShortcutAccelerator } = createHarness({
      loadResult: { model_mode: 'offline' },
    });

    const result = await handlers['load-frontend-config']();

    expect(result).toEqual({
      model_mode: 'offline',
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
    });
    expect(latest.current).toBe(result);
    expect(setGlobalAgentStopShortcutAccelerator).toHaveBeenCalledWith(
      'CommandOrControl+Shift+Escape',
    );
  });

  test('save handler updates shortcut runtime and delegates persistence', async () => {
    const persistDesktopUiConfigToDisk = jest.fn(async () => ({ success: true }));
    const { handlers, setGlobalAgentStopShortcutAccelerator } = createHarness({
      runtime: { persistDesktopUiConfigToDisk },
    });
    const config = {
      model_mode: 'online',
      global_agent_stop_shortcut: 'CommandOrControl+Alt+.',
    };

    await expect(handlers['save-frontend-config'](null, config)).resolves.toEqual({
      success: true,
    });

    expect(setGlobalAgentStopShortcutAccelerator).toHaveBeenCalledWith(
      'CommandOrControl+Alt+.',
    );
    expect(persistDesktopUiConfigToDisk).toHaveBeenCalledWith(config);
  });

  test('runtime registers config handlers with late shortcut setter resolution', async () => {
    const handlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
    };
    const latest = { current: null };
    const setGlobalAgentStopShortcutAccelerator = jest.fn();
    const getGlobalAgentStopShortcutAcceleratorSetter = jest.fn(
      () => setGlobalAgentStopShortcutAccelerator,
    );
    const runtime = createDesktopUiConfigHandlersRuntime({
      loadCachedDesktopUiConfigFromDisk: jest.fn(async () => ({ model_mode: 'runtime' })),
      persistDesktopUiConfigToDisk: jest.fn(async (config) => ({ success: true, config })),
      isValidConfigPayload: (config) => Boolean(config) && typeof config === 'object',
      applyShortcutStatusFallbackToConfig: (config) => ({
        ...config,
        global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
      }),
      getLatestDesktopUiConfig: () => latest.current,
      setLatestDesktopUiConfig: (config) => {
        latest.current = config;
      },
      getGlobalAgentStopShortcutAcceleratorSetter,
    });

    runtime.register({ ipcMain });

    await expect(handlers['load-frontend-config']()).resolves.toEqual({
      model_mode: 'runtime',
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
    });

    expect(getGlobalAgentStopShortcutAcceleratorSetter).toHaveBeenCalledTimes(1);
    expect(setGlobalAgentStopShortcutAccelerator).toHaveBeenCalledWith(
      'CommandOrControl+Shift+Escape',
    );
  });

  test('ipc.cjs registers desktop UI config handlers through the runtime wrapper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_desktop_ui_config_handlers.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createDesktopUiConfigHandlersRuntime({');
    expect(mainSource).not.toContain('desktopUiConfigHandlersRuntime.register({ ipcMain })');
    expect(initializationSource).toContain('desktopUiConfigHandlersRuntime.register({ ipcMain })');
    expect(mainSource).not.toContain('registerDesktopUiConfigHandlers({');
    expect(helperSource).toContain('function createDesktopUiConfigHandlersRuntime');
    expect(helperSource).toContain('return registerDesktopUiConfigHandlers({');
  });
});
