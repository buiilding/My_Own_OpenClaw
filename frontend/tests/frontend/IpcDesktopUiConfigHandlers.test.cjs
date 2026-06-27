/**
 * Covers desktop UI config IPC handler behavior in the frontend test suite.
 */

const fs = require('fs/promises');
const path = require('path');

const {
  createDesktopUiConfigHandlersRuntime,
} = require('../../src/main/ipc/ipc_desktop_ui_config_handlers.cjs');

function createHarness(overrides = {}) {
  const handlers = {};
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
  };
  let latest = overrides.initialLatest || null;
  const setGlobalAgentStopShortcutAccelerator = jest.fn();
  const desktopUiConfigStore = {
    getSnapshot: jest.fn(() => latest),
    hydrate: jest.fn(async () => {
      latest = overrides.loadResult || null;
      return latest;
    }),
    ...overrides.desktopUiConfigStore,
  };
  const runtime = createDesktopUiConfigHandlersRuntime({
    desktopUiConfigStore,
    persistDesktopUiConfigToDisk: jest.fn(async (config) => ({ success: true, config })),
    isValidConfigPayload: (config) => (
      Boolean(config) && typeof config === 'object' && !Array.isArray(config)
    ),
    setGlobalAgentStopShortcutAccelerator,
    ...overrides.runtime,
  });

  runtime.register({ ipcMain });

  return {
    handlers,
    ipcMain,
    runtime,
    desktopUiConfigStore,
    latest,
    setGlobalAgentStopShortcutAccelerator,
  };
}

describe('desktop UI config IPC handlers', () => {
  test('load handler hydrates the store and updates shortcut runtime', async () => {
    const { handlers, desktopUiConfigStore, setGlobalAgentStopShortcutAccelerator } = createHarness({
      loadResult: {
        model_mode: 'offline',
        global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
      },
    });

    const result = await handlers['load-frontend-config']();

    expect(result).toEqual({
      model_mode: 'offline',
      global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
    });
    expect(desktopUiConfigStore.hydrate).toHaveBeenCalledTimes(1);
    expect(desktopUiConfigStore.getSnapshot).toHaveBeenCalledTimes(1);
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
    const setGlobalAgentStopShortcutAccelerator = jest.fn();
    const getGlobalAgentStopShortcutAcceleratorSetter = jest.fn(
      () => setGlobalAgentStopShortcutAccelerator,
    );
    let latest = null;
    const desktopUiConfigStore = {
      hydrate: jest.fn(async () => {
        latest = {
          model_mode: 'runtime',
          global_agent_stop_shortcut: 'CommandOrControl+Shift+Escape',
        };
        return latest;
      }),
      getSnapshot: jest.fn(() => latest),
    };
    const runtime = createDesktopUiConfigHandlersRuntime({
      desktopUiConfigStore,
      persistDesktopUiConfigToDisk: jest.fn(async (config) => ({ success: true, config })),
      isValidConfigPayload: (config) => Boolean(config) && typeof config === 'object',
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
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_desktop_ui_config_handlers.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createDesktopUiConfigHandlersRuntime({');
    expect(mainSource).not.toContain('desktopUiConfigHandlersRuntime.register({ ipcMain })');
    expect(initializationSource).toContain('desktopUiConfigHandlersRuntime.register({ ipcMain })');
    expect(mainSource).not.toContain('registerDesktopUiConfigHandlers({');
    expect(helperSource).toContain('function createDesktopUiConfigHandlersRuntime');
    expect(helperSource).toContain('return registerDesktopUiConfigHandlers({');
    const helperModule = require('../../src/main/ipc/ipc_desktop_ui_config_handlers.cjs');
    expect(helperModule.registerDesktopUiConfigHandlers).toBeUndefined();
  });
});
