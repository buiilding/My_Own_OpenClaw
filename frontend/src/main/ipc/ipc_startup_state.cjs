/**
 * Provides the ipc startup state module for the Electron main process.
 */

function initializeIpcStartupState({
  loadInstallAuthStateFromDisk,
  applyInstallAuthState,
  loadCachedFrontendConfigFromDisk,
  isValidConfigPayload,
  applyShortcutStatusFallbackToConfig,
  setLatestFrontendConfig,
  setGlobalAgentStopShortcutAccelerator,
  setAgentLoopStopShortcutEnabled,
  getResponseOverlayPhase,
  isAgentLoopStopShortcutPhase,
  onFrontendConfigLoaded,
  log,
}) {
  loadInstallAuthStateFromDisk(log)
    .then((state) => {
      applyInstallAuthState(state);
    })
    .catch(() => {});

  loadCachedFrontendConfigFromDisk()
    .then((config) => {
      if (!isValidConfigPayload(config)) {
        return;
      }
      const nextConfig = applyShortcutStatusFallbackToConfig({ ...config });
      setLatestFrontendConfig(nextConfig);
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(nextConfig.global_agent_stop_shortcut);
      }
      if (typeof onFrontendConfigLoaded === 'function') {
        onFrontendConfigLoaded(nextConfig);
      }
    })
    .catch((error) => {
      if (typeof log === 'function') {
        log(`Failed to hydrate cached frontend config during startup: ${error?.message || error}`);
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
