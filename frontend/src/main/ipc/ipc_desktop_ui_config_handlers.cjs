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

function createDesktopUiConfigHandlersRuntime({
  loadCachedDesktopUiConfigFromDisk,
  persistDesktopUiConfigToDisk,
  isValidConfigPayload,
  applyShortcutStatusFallbackToConfig,
  getLatestDesktopUiConfig,
  setLatestDesktopUiConfig,
  setGlobalAgentStopShortcutAccelerator,
  getGlobalAgentStopShortcutAcceleratorSetter,
} = {}) {
  function register({ ipcMain } = {}) {
    const resolvedSetGlobalAgentStopShortcutAccelerator =
      typeof getGlobalAgentStopShortcutAcceleratorSetter === 'function'
        ? getGlobalAgentStopShortcutAcceleratorSetter()
        : setGlobalAgentStopShortcutAccelerator;
    return registerDesktopUiConfigHandlers({
      ipcMain,
      loadCachedDesktopUiConfigFromDisk,
      persistDesktopUiConfigToDisk,
      isValidConfigPayload,
      applyShortcutStatusFallbackToConfig,
      getLatestDesktopUiConfig,
      setLatestDesktopUiConfig,
      setGlobalAgentStopShortcutAccelerator: resolvedSetGlobalAgentStopShortcutAccelerator,
    });
  }

  return {
    register,
  };
}

module.exports = {
  createDesktopUiConfigHandlersRuntime,
};
