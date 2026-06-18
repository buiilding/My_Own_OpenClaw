/**
 * Handles desktop UI config IPC events for the Electron main process.
 */

function registerDesktopUiConfigHandlers({
  ipcMain,
  loadCachedDesktopUiConfigFromDisk,
  loadCachedFrontendConfigFromDisk,
  persistDesktopUiConfigToDisk,
  persistFrontendConfigToDisk,
  isValidConfigPayload,
  applyShortcutStatusFallbackToConfig,
  getLatestDesktopUiConfig,
  getLatestFrontendConfig,
  setLatestDesktopUiConfig,
  setLatestFrontendConfig,
  setGlobalAgentStopShortcutAccelerator,
}) {
  const loadCachedConfigFromDisk = loadCachedDesktopUiConfigFromDisk
    || loadCachedFrontendConfigFromDisk;
  const persistConfigToDisk = persistDesktopUiConfigToDisk
    || persistFrontendConfigToDisk;
  const getLatestConfig = getLatestDesktopUiConfig || getLatestFrontendConfig;
  const setLatestConfig = setLatestDesktopUiConfig || setLatestFrontendConfig;

  ipcMain.handle('load-frontend-config', async () => {
    const config = await loadCachedConfigFromDisk();
    if (isValidConfigPayload(config)) {
      const nextConfig = applyShortcutStatusFallbackToConfig({ ...config });
      setLatestConfig(nextConfig);
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(nextConfig.global_agent_stop_shortcut);
      }
    }
    return getLatestConfig();
  });

  ipcMain.handle('save-frontend-config', async (_event, config) => {
    if (
      isValidConfigPayload(config)
      && typeof setGlobalAgentStopShortcutAccelerator === 'function'
    ) {
      setGlobalAgentStopShortcutAccelerator(config.global_agent_stop_shortcut);
    }
    return persistConfigToDisk(config);
  });
}

const registerFrontendConfigHandlers = registerDesktopUiConfigHandlers;

module.exports = {
  registerDesktopUiConfigHandlers,
  registerFrontendConfigHandlers,
};
