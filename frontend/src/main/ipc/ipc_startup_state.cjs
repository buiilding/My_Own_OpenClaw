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
    })
    .catch(() => {});

  if (typeof setAgentLoopStopShortcutEnabled === 'function') {
    setAgentLoopStopShortcutEnabled(
      isAgentLoopStopShortcutPhase(getResponseOverlayPhase()),
    );
  }
}

module.exports = {
  initializeIpcStartupState,
};
