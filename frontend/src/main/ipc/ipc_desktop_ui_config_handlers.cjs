/**
 * Handles desktop UI config IPC events for the Electron main process.
 */

function registerDesktopUiConfigHandlers({
  ipcMain,
  loadCachedDesktopUiConfigFromDisk,
  persistDesktopUiConfigToDisk,
  isValidConfigPayload,
  applyShortcutStatusFallbackToConfig,
  getLatestDesktopUiConfig,
  setLatestDesktopUiConfig,
  setGlobalAgentStopShortcutAccelerator,
}) {
  ipcMain.handle('load-frontend-config', async () => {
    const config = await loadCachedDesktopUiConfigFromDisk();
    if (isValidConfigPayload(config)) {
      const nextConfig = applyShortcutStatusFallbackToConfig({ ...config });
      setLatestDesktopUiConfig(nextConfig);
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(nextConfig.global_agent_stop_shortcut);
      }
    }
    return getLatestDesktopUiConfig();
  });

  ipcMain.handle('save-frontend-config', async (_event, config) => {
    if (
      isValidConfigPayload(config)
      && typeof setGlobalAgentStopShortcutAccelerator === 'function'
    ) {
      setGlobalAgentStopShortcutAccelerator(config.global_agent_stop_shortcut);
    }
    return persistDesktopUiConfigToDisk(config);
  });
}

module.exports = {
  registerDesktopUiConfigHandlers,
};
