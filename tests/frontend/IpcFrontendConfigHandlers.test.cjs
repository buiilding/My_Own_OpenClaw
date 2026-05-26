const {
  registerFrontendConfigHandlers,
} = require('../../frontend/src/main/ipc/ipc_frontend_config_handlers.cjs');

function createHarness(overrides = {}) {
  const handlers = {};
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
  };
  const latest = { current: overrides.initialLatest || null };
  const setGlobalAgentStopShortcutAccelerator = jest.fn();
  registerFrontendConfigHandlers({
    ipcMain,
    loadCachedFrontendConfigFromDisk: jest.fn(async () => overrides.loadResult),
    persistFrontendConfigToDisk: jest.fn(async (config) => ({ success: true, config })),
    isValidConfigPayload: (config) => (
      Boolean(config) && typeof config === 'object' && !Array.isArray(config)
    ),
    applyShortcutStatusFallbackToConfig: (config) => ({
      ...config,
      global_agent_stop_shortcut: config.global_agent_stop_shortcut || 'CommandOrControl+Shift+Escape',
    }),
    getLatestFrontendConfig: () => latest.current,
    setLatestFrontendConfig: (config) => {
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

describe('ipc_frontend_config_handlers', () => {
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
    const persistFrontendConfigToDisk = jest.fn(async () => ({ success: true }));
    const { handlers, setGlobalAgentStopShortcutAccelerator } = createHarness({
      runtime: { persistFrontendConfigToDisk },
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
    expect(persistFrontendConfigToDisk).toHaveBeenCalledWith(config);
  });
});
