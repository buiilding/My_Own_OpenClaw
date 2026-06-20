/**
 * Owns initialize-time IPC runtime orchestration for the Electron main process.
 */

function createIpcInitializationRuntime({
  ipcMain,
  refreshBackendEndpoints,
  hostOptionState,
  rendererWindowRuntime,
  trackRendererWindow,
  ipcStartupStateRuntime,
  desktopUiConfigHandlersRuntime,
  extensionMcpHandlersRuntime,
  clientSessionHandlersRuntime,
  artifactHandlersRuntime,
  imageInteractionHandlersRuntime,
  rendererDiagnosticsHandlersRuntime,
  pendingTurnRuntime,
  chatQueryHandlerRuntime,
  agentSdkInvokeHandlerRuntime,
} = {}) {
  function initialize(win, options = {}) {
    refreshBackendEndpoints({
      isPackaged: options.isPackaged === true,
    });
    hostOptionState.applyInitializeOptions(options);
    const getWindows = typeof options.getWindows === 'function'
      ? options.getWindows
      : () => ({ mainWindow: win, chatWindow: null });

    rendererWindowRuntime.reset();
    trackRendererWindow(win);
    ipcStartupStateRuntime.initialize();

    desktopUiConfigHandlersRuntime.register({ ipcMain });
    extensionMcpHandlersRuntime.register({ ipcMain });
    clientSessionHandlersRuntime.register({ ipcMain });
    artifactHandlersRuntime.register({ ipcMain });
    imageInteractionHandlersRuntime.register({ ipcMain });
    rendererDiagnosticsHandlersRuntime.register({ ipcMain });
    pendingTurnRuntime.register({ ipcMain });

    const {
      handleRendererChatQuery,
      handleRendererStopQuery,
    } = chatQueryHandlerRuntime.createHandlers({
      getWindows,
      onBeforeOverlayQueryCapture: hostOptionState.getOnBeforeOverlayQueryCapture(),
    });

    agentSdkInvokeHandlerRuntime.register({
      ipcMain,
      handleRendererChatQuery,
      handleRendererStopQuery,
    });
  }

  return {
    initialize,
  };
}

module.exports = {
  createIpcInitializationRuntime,
};
