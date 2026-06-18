/**
 * Coordinates the main process bootstrap runtime for the Electron main process.
 */

function createWindowBootstrapRuntime(deps) {
  function syncCurrentOverlayPhase() {
    const state = deps.getState();
    const currentPhase = state?.responseOverlayPhase || 'idle';
    if (typeof state?.applyResponseOverlayPhase === 'function') {
      state.applyResponseOverlayPhase({ phase: currentPhase });
    }
  }

  function createWindow() {
    const state = deps.getState();
    const mainWindow = deps.createMainWindowRuntime({
      BrowserWindow: deps.BrowserWindow,
      path: deps.path,
      app: deps.app,
      platform: deps.platform,
      vmMode: deps.vmMode,
      minimizeToTrayOnClose: !deps.vmMode,
      enableDevTransparencyUi: deps.enableDevTransparencyUi,
      enableDebugStreamTrace: deps.enableDebugStreamTrace,
      enableDebugToolScreenshot: deps.enableDebugToolScreenshot,
      initializeIpc: deps.initializeIpc,
      applyResponseOverlayPhase: state.applyResponseOverlayPhase,
      setAgentLoopStopShortcutEnabled: deps.setAgentLoopStopShortcutEnabled,
      setGlobalAgentStopShortcutAccelerator: deps.setGlobalAgentStopShortcutAccelerator,
      prepareOverlayQueryCaptureFocus: deps.prepareOverlayQueryCaptureFocus,
      initializeWakewordBridge: deps.initializeWakewordBridge,
      showChatWindow: deps.showChatWindow,
      emitWakewordSttTrigger: deps.emitWakewordSttTrigger,
      initializeLocalRuntimeBridge: deps.initializeLocalRuntimeBridge,
      getKnownLocalRuntime: deps.getKnownLocalRuntime,
      ensureLocalRuntime: deps.ensureLocalRuntime,
      permissionStatePath: typeof deps.getPermissionStatePath === 'function'
        ? deps.getPermissionStatePath()
        : null,
      initializeMainProcessIpc: deps.initializeMainProcessIpc,
      appIconFileName: deps.appIconFileName,
      rendererLogPrefix: deps.rendererLogPrefix,
      bundledRuntimeCopy: deps.bundledRuntimeCopy,
      runtimePaths: deps.runtimePaths,
      localRuntimeDaemonEntrypoint: deps.localRuntimeDaemonEntrypoint,
      localRuntimeEnv: deps.localRuntimeEnv,
      wakewordEnv: deps.wakewordEnv,
      wakewordStderrLogMarkers: deps.wakewordStderrLogMarkers,
      localRuntimeBridgeCopy: deps.localRuntimeBridgeCopy,
      getWindows: () => deps.getState().windows,
      getMainWindowMode: deps.getMainWindowMode,
      setMainWindow: deps.setMainWindow,
      syncWindowDisplayAffinity: deps.syncWindowDisplayAffinity,
      localToolLifecycle: deps.localToolLifecycle,
      syncSdkLiveTurnSurfaceIntent: deps.syncSdkLiveTurnSurfaceIntent,
      log: (...args) => deps.log(...args),
      warn: (...args) => deps.warn(...args),
    });
    deps.setMainWindow(mainWindow);

    if (deps.vmWorkerMode && !deps.getState().vmWorkerRuntime) {
      const vmWorkerRuntime = deps.createVmWorkerRuntime({
        env: process.env,
        getBackendConnectionState: deps.getBackendConnectionState,
        sendAutomatedQuery: deps.sendAutomatedQuery,
        stopQueryThroughAgentSdkRuntime: deps.stopQueryThroughAgentSdkRuntime,
        registerBackendMessageObserver: deps.registerBackendMessageObserver,
        runsApiKeyHeader: deps.runsApiKeyHeader,
        vmWorkerEnv: deps.vmWorkerEnv,
        log: (...args) => deps.log(...args),
        warn: (...args) => deps.warn(...args),
      });
      vmWorkerRuntime.start();
      deps.setVmWorkerRuntime(vmWorkerRuntime);
    }
  }

  function createChatWindow() {
    const chatWindow = deps.createChatWindowRuntime({
      BrowserWindow: deps.BrowserWindow,
      path: deps.path,
      app: deps.app,
      platform: deps.platform,
      enableDevTransparencyUi: deps.enableDevTransparencyUi,
      enableDebugStreamTrace: deps.enableDebugStreamTrace,
      enableDebugToolScreenshot: deps.enableDebugToolScreenshot,
      positionChatWindow: deps.positionChatWindow,
      hideChatWindow: deps.hideChatWindow,
      syncWakewordToggleForChatVisibility: deps.syncWakewordToggleForChatVisibility,
      setChatWindow: deps.setChatWindow,
      applyOverlayWindowPolicy: deps.applyOverlayWindowPolicy,
      syncWindowDisplayAffinity: deps.syncWindowDisplayAffinity,
      appIconFileName: deps.appIconFileName,
      rendererLogPrefix: deps.rendererLogPrefix,
      log: (...args) => deps.log(...args),
      warn: (...args) => deps.warn(...args),
    });
    deps.setChatWindow(chatWindow);
    syncCurrentOverlayPhase();
    return chatWindow;
  }

  function createResponseWindow() {
    const responseWindow = deps.createResponseWindowRuntime({
      BrowserWindow: deps.BrowserWindow,
      path: deps.path,
      app: deps.app,
      platform: deps.platform,
      enableDevTransparencyUi: deps.enableDevTransparencyUi,
      enableDebugStreamTrace: deps.enableDebugStreamTrace,
      enableDebugToolScreenshot: deps.enableDebugToolScreenshot,
      enableOsToolGhostDebug: deps.enableOsToolGhostDebug,
      responseWindowDebugView: deps.responseWindowDebugView,
      positionResponseWindow: deps.positionResponseWindow,
      showResponseWindowInactive: deps.showResponseWindowInactive,
      setResponseOverlayVisible: (nextVisible) => {
        deps.getState().setResponseOverlayVisible(nextVisible);
      },
      setResponseOverlayVisibilityState: deps.setResponseOverlayVisibilityState,
      setResponseWindow: deps.setResponseWindow,
      applyOverlayWindowPolicy: deps.applyOverlayWindowPolicy,
      syncWindowDisplayAffinity: deps.syncWindowDisplayAffinity,
      appIconFileName: deps.appIconFileName,
      rendererLogPrefix: deps.rendererLogPrefix,
      log: (...args) => deps.log(...args),
      warn: (...args) => deps.warn(...args),
    });
    deps.setResponseWindow(responseWindow);
    syncCurrentOverlayPhase();
    return responseWindow;
  }

  function createTray() {
    return deps.createTrayRuntime({
      Tray: deps.Tray,
      Menu: deps.Menu,
      showMainWindow: deps.showMainWindow,
      app: deps.app,
      appIconFileName: deps.appIconFileName,
      trayTooltip: deps.trayTooltip,
    });
  }

  return {
    createWindow,
    createChatWindow,
    createResponseWindow,
    createTray,
  };
}

module.exports = {
  createWindowBootstrapRuntime,
};
