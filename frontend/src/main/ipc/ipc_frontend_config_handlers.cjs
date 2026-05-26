function registerFrontendConfigHandlers({
  ipcMain,
  loadCachedFrontendConfigFromDisk,
  persistFrontendConfigToDisk,
  isValidConfigPayload,
  applyShortcutStatusFallbackToConfig,
  getLatestFrontendConfig,
  setLatestFrontendConfig,
  setGlobalAgentStopShortcutAccelerator,
}) {
  ipcMain.handle('load-frontend-config', async () => {
    const config = await loadCachedFrontendConfigFromDisk();
    if (isValidConfigPayload(config)) {
      const nextConfig = applyShortcutStatusFallbackToConfig({ ...config });
      setLatestFrontendConfig(nextConfig);
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(nextConfig.global_agent_stop_shortcut);
      }
    }
    return getLatestFrontendConfig();
  });

  ipcMain.handle('save-frontend-config', async (_event, config) => {
    if (
      isValidConfigPayload(config)
      && typeof setGlobalAgentStopShortcutAccelerator === 'function'
    ) {
      setGlobalAgentStopShortcutAccelerator(config.global_agent_stop_shortcut);
    }
    return persistFrontendConfigToDisk(config);
  });
}

module.exports = {
  registerFrontendConfigHandlers,
};
