/**
 * Provides the ipc startup state module for the Electron main process.
 */

function initializeIpcStartupState({
  loadInstallAuthStateFromDisk,
  applyInstallAuthState,
  loadCachedDesktopUiConfigFromDisk,
  isValidConfigPayload,
  applyShortcutStatusFallbackToConfig,
  setLatestDesktopUiConfig,
  setGlobalAgentStopShortcutAccelerator,
  setAgentLoopStopShortcutEnabled,
  getResponseOverlayPhase,
  isAgentLoopStopShortcutPhase,
  onDesktopUiConfigLoaded,
  log,
}) {
  loadInstallAuthStateFromDisk(log)
    .then((state) => {
      applyInstallAuthState(state);
    })
    .catch(() => {});

  loadCachedDesktopUiConfigFromDisk()
    .then((config) => {
      if (!isValidConfigPayload(config)) {
        return;
      }
      const nextConfig = applyShortcutStatusFallbackToConfig({ ...config });
      setLatestDesktopUiConfig(nextConfig);
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(nextConfig.global_agent_stop_shortcut);
      }
      if (typeof onDesktopUiConfigLoaded === 'function') {
        onDesktopUiConfigLoaded(nextConfig);
      }
    })
    .catch((error) => {
      if (typeof log === 'function') {
        log(`Failed to hydrate cached desktop UI config during startup: ${error?.message || error}`);
      }
    });

  if (typeof setAgentLoopStopShortcutEnabled === 'function') {
    setAgentLoopStopShortcutEnabled(
      isAgentLoopStopShortcutPhase(getResponseOverlayPhase()),
    );
  }
}

module.exports = {
  initializeIpcStartupState,
};
