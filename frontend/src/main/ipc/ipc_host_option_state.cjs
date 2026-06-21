/**
 * Owns Electron-main IPC host initialization option state.
 */

function normalizeOptionalFunction(value) {
  return typeof value === 'function' ? value : null;
}

function normalizeOptionalObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function buildDesktopLocalRuntimeLaunchConfig(options = {}) {
  return {
    isPackaged: options.isPackaged === true,
    permissionStatePath: options.permissionStatePath,
    authStatePath: options.authStatePath,
    copy: options.bundledRuntimeCopy,
    daemonEntrypoint: options.localRuntimeDaemonEntrypoint,
    localRuntimeEnv: options.localRuntimeEnv,
    runtimePaths: options.runtimePaths,
  };
}

function createIpcHostOptionState() {
  let applyResponseOverlayPhase = null;
  let onBeforeOverlayQueryCapture = null;
  let setAgentLoopStopShortcutEnabled = null;
  let setGlobalAgentStopShortcutAccelerator = null;
  let localToolLifecycle = null;
  let syncSdkLiveTurnSurfaceIntent = null;
  let agentWebSocketImpl = null;
  let desktopLocalRuntimeLaunchConfig = null;

  function applyInitializeOptions(options = {}) {
    applyResponseOverlayPhase = normalizeOptionalFunction(options.applyResponseOverlayPhase);
    onBeforeOverlayQueryCapture = normalizeOptionalFunction(options.onBeforeOverlayQueryCapture);
    setAgentLoopStopShortcutEnabled = normalizeOptionalFunction(
      options.setAgentLoopStopShortcutEnabled,
    );
    setGlobalAgentStopShortcutAccelerator = normalizeOptionalFunction(
      options.setGlobalAgentStopShortcutAccelerator,
    );
    localToolLifecycle = normalizeOptionalObject(options.localToolLifecycle);
    syncSdkLiveTurnSurfaceIntent = normalizeOptionalFunction(
      options.syncSdkLiveTurnSurfaceIntent,
    );
    agentWebSocketImpl = normalizeOptionalFunction(options.WebSocketImpl);
    desktopLocalRuntimeLaunchConfig = buildDesktopLocalRuntimeLaunchConfig(options);
  }

  function getApplyResponseOverlayPhase() {
    return applyResponseOverlayPhase;
  }

  function getOnBeforeOverlayQueryCapture() {
    return onBeforeOverlayQueryCapture;
  }

  function getSetAgentLoopStopShortcutEnabled() {
    return setAgentLoopStopShortcutEnabled;
  }

  function getSetGlobalAgentStopShortcutAccelerator() {
    return setGlobalAgentStopShortcutAccelerator;
  }

  function getLocalToolLifecycle() {
    return localToolLifecycle;
  }

  function getSyncSdkLiveTurnSurfaceIntent() {
    return syncSdkLiveTurnSurfaceIntent;
  }

  function getAgentWebSocketImpl() {
    return agentWebSocketImpl;
  }

  function getDesktopLocalRuntimeLaunchConfig() {
    return desktopLocalRuntimeLaunchConfig;
  }

  function reset() {
    applyResponseOverlayPhase = null;
    onBeforeOverlayQueryCapture = null;
    setAgentLoopStopShortcutEnabled = null;
    setGlobalAgentStopShortcutAccelerator = null;
    localToolLifecycle = null;
    syncSdkLiveTurnSurfaceIntent = null;
    agentWebSocketImpl = null;
    desktopLocalRuntimeLaunchConfig = null;
  }

  return {
    applyInitializeOptions,
    getAgentWebSocketImpl,
    getApplyResponseOverlayPhase,
    getDesktopLocalRuntimeLaunchConfig,
    getLocalToolLifecycle,
    getOnBeforeOverlayQueryCapture,
    getSetAgentLoopStopShortcutEnabled,
    getSetGlobalAgentStopShortcutAccelerator,
    getSyncSdkLiveTurnSurfaceIntent,
    reset,
  };
}

module.exports = {
  createIpcHostOptionState,
};
