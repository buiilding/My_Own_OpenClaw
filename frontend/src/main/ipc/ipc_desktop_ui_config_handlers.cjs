/**
 * Handles desktop UI config IPC events for the Electron main process.
 */

function registerDesktopUiConfigHandlers({
  ipcMain,
  desktopUiConfigStore,
  persistDesktopUiConfigToDisk,
  isValidConfigPayload,
  setGlobalAgentStopShortcutAccelerator,
}) {
  ipcMain.handle('load-frontend-config', async () => {
    const config = await desktopUiConfigStore.hydrate();
    if (isValidConfigPayload(config)) {
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(config.global_agent_stop_shortcut);
      }
    }
    return desktopUiConfigStore.getSnapshot();
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
  desktopUiConfigStore,
  persistDesktopUiConfigToDisk,
  isValidConfigPayload,
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
      desktopUiConfigStore,
      persistDesktopUiConfigToDisk,
      isValidConfigPayload,
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
