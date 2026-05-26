function registerSdkCommandForwardingHandler({
  ipcMain,
  normalizeSdkRuntimeCommand,
  shouldConnectForSdkRuntimeCommand,
  shouldLogRendererSdkRuntimeCommand,
  shouldQueueUntilConnected,
  shouldSyncSettingsBeforeSdkRuntimeCommand,
  sendSdkRuntimeCommand,
  getWindieSdkRuntime,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  ensureInitialSettingsSync,
  getPendingSettingsSyncPromise,
  queueListModelsRequest,
  sendSettingsUpdate,
  attachAgentDefinitionContext,
  log,
}) {
  ipcMain.on('to-backend', async (_event, message = {}) => {
    const normalizedCommand = normalizeSdkRuntimeCommand(message);
    const type = normalizedCommand.type;
    let payload = normalizedCommand.payload;

    if (!type) {
      log('Ignoring malformed to-backend message: missing string "type"');
      return;
    }

    if (type === 'query' || type === 'stop-query') {
      log(`Ignoring ${type} on generic to-backend IPC; use the typed chat IPC channel.`);
      return;
    }

    if (type === 'update-settings') {
      void sendSettingsUpdate(payload, 'renderer-update');
      return;
    }

    if (shouldQueueUntilConnected(type) && !isBackendRuntimeConnected()) {
      queueListModelsRequest();
      log('Queued list-models request until backend websocket is connected.');
      try {
        await ensureBackendConnection('list-models');
      } catch (error) {
        log(`Failed to connect backend for list-models: ${error?.message || error}`);
      }
      return;
    }

    if (shouldLogRendererSdkRuntimeCommand(type)) {
      log(`Received ${type} from renderer`);
    }

    if (type === 'rehydrate') {
      payload = attachAgentDefinitionContext(payload);
    }

    let backendConnectionReady = true;
    if (shouldConnectForSdkRuntimeCommand(type) && !isBackendRuntimeConnected()) {
      try {
        await ensureBackendConnection(type);
      } catch (error) {
        backendConnectionReady = false;
        log(`Failed to connect backend for ${type}: ${error?.message || error}`);
      }
    }

    if (backendConnectionReady && shouldSyncSettingsBeforeSdkRuntimeCommand(type)) {
      await ensureInitialSettingsSync();
      const pendingSettingsSyncPromise = getPendingSettingsSyncPromise();
      if (pendingSettingsSyncPromise) {
        await pendingSettingsSyncPromise;
      }
    }

    if (backendConnectionReady) {
      sendSdkRuntimeCommand(getWindieSdkRuntime(), {
        type,
        payload,
      });
    }
  });
}

module.exports = {
  registerSdkCommandForwardingHandler,
};
