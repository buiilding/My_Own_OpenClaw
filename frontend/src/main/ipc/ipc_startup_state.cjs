/**
 * Provides the ipc startup state module for the Electron main process.
 */

function initializeIpcStartupState({
  loadInstallAuthStateFromDisk,
  applyInstallAuthState,
  hydrateDesktopUiConfigStore,
  isValidConfigPayload,
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

  hydrateDesktopUiConfigStore()
    .then((config) => {
      if (!isValidConfigPayload(config)) {
        return;
      }
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(config.global_agent_stop_shortcut);
      }
      if (typeof onDesktopUiConfigLoaded === 'function') {
        onDesktopUiConfigLoaded(config);
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

function createIpcStartupStateRuntime({
  loadInstallAuthStateFromDisk,
  applyInstallAuthState,
  hydrateDesktopUiConfigStore,
  isValidConfigPayload,
  setGlobalAgentStopShortcutAccelerator,
  getGlobalAgentStopShortcutAcceleratorSetter,
  setAgentLoopStopShortcutEnabled,
  getAgentLoopStopShortcutEnabledSetter,
  getResponseOverlayPhase,
  isAgentLoopStopShortcutPhase,
  onDesktopUiConfigLoaded,
  log,
} = {}) {
  function initialize() {
    const resolvedSetGlobalAgentStopShortcutAccelerator =
      typeof getGlobalAgentStopShortcutAcceleratorSetter === 'function'
        ? getGlobalAgentStopShortcutAcceleratorSetter()
        : setGlobalAgentStopShortcutAccelerator;
    const resolvedSetAgentLoopStopShortcutEnabled =
      typeof getAgentLoopStopShortcutEnabledSetter === 'function'
        ? getAgentLoopStopShortcutEnabledSetter()
        : setAgentLoopStopShortcutEnabled;
    return initializeIpcStartupState({
      loadInstallAuthStateFromDisk,
      applyInstallAuthState,
      hydrateDesktopUiConfigStore,
      isValidConfigPayload,
      setGlobalAgentStopShortcutAccelerator: resolvedSetGlobalAgentStopShortcutAccelerator,
      setAgentLoopStopShortcutEnabled: resolvedSetAgentLoopStopShortcutEnabled,
      getResponseOverlayPhase,
      isAgentLoopStopShortcutPhase,
      onDesktopUiConfigLoaded,
      log,
    });
  }

  return {
    initialize,
  };
}

module.exports = {
  createIpcStartupStateRuntime,
};
