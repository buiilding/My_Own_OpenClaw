/**
 * Provides the ipc startup state module for the Electron main process.
 */

function initializeIpcStartupState({
  loadInstallAuthStateFromDisk,
  applyInstallAuthState,
  loadCachedDesktopUiConfigFromDisk,
  loadCachedFrontendConfigFromDisk,
  isValidConfigPayload,
  applyShortcutStatusFallbackToConfig,
  setLatestDesktopUiConfig,
  setLatestFrontendConfig,
  setGlobalAgentStopShortcutAccelerator,
  setAgentLoopStopShortcutEnabled,
  getResponseOverlayPhase,
  isAgentLoopStopShortcutPhase,
  onDesktopUiConfigLoaded,
  onFrontendConfigLoaded,
  log,
}) {
  const loadCachedConfigFromDisk = loadCachedDesktopUiConfigFromDisk
    || loadCachedFrontendConfigFromDisk;
  const setLatestConfig = setLatestDesktopUiConfig || setLatestFrontendConfig;
  const onConfigLoaded = onDesktopUiConfigLoaded || onFrontendConfigLoaded;

  loadInstallAuthStateFromDisk(log)
    .then((state) => {
      applyInstallAuthState(state);
    })
    .catch(() => {});

  loadCachedConfigFromDisk()
    .then((config) => {
      if (!isValidConfigPayload(config)) {
        return;
      }
      const nextConfig = applyShortcutStatusFallbackToConfig({ ...config });
      setLatestConfig(nextConfig);
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(nextConfig.global_agent_stop_shortcut);
      }
      if (typeof onConfigLoaded === 'function') {
        onConfigLoaded(nextConfig);
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
