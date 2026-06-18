/**
 * Covers desktop UI config IPC handler behavior in the frontend test suite.
 */

const {
  registerDesktopUiConfigHandlers,
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
});
