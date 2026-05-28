function registerSdkCommandForwardingHandler({
  ipcMain,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  ensureInitialSettingsSync,
  getPendingSettingsSyncPromise,
  queueListModelsRequest,
  sendSettingsUpdate,
  requestModelList,
  rehydrate,
  compactHistory,
  wakewordDetected,
  log,
}) {
  function normalizeCommand(message = {}) {
    const type = typeof message?.type === 'string' ? message.type : null;
    const payload = (
      message?.payload
      && typeof message.payload === 'object'
      && !Array.isArray(message.payload)
    ) ? { ...message.payload } : {};
    return { type, payload };
  }

  ipcMain.on('to-backend', async (_event, message = {}) => {
    const normalizedCommand = normalizeCommand(message);
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

    if (type === 'list-models' && !isBackendRuntimeConnected()) {
      queueListModelsRequest();
      log('Queued list-models request until backend websocket is connected.');
      try {
        await ensureBackendConnection('list-models');
      } catch (_error) {
        // Queued model-list requests are best-effort; startup/shutdown may close
        // the SDK session before a socket opens.
      }
      return;
    }

    if (type === 'wakeword-detected') {
      log(`Received ${type} from renderer`);
    }

    let backendConnectionReady = true;
    if (
      (type === 'wakeword-detected' || type === 'compact-history' || type === 'rehydrate')
      && !isBackendRuntimeConnected()
    ) {
      try {
        await ensureBackendConnection(type);
      } catch (error) {
        backendConnectionReady = false;
        log(`Failed to connect backend for ${type}: ${error?.message || error}`);
      }
    }

    if (backendConnectionReady && type === 'wakeword-detected') {
      await ensureInitialSettingsSync();
      const pendingSettingsSyncPromise = getPendingSettingsSyncPromise();
      if (pendingSettingsSyncPromise) {
        await pendingSettingsSyncPromise;
      }
    }

    if (backendConnectionReady) {
      if (type === 'list-models') {
        await requestModelList();
      } else if (type === 'wakeword-detected') {
        await wakewordDetected(payload);
      } else if (type === 'compact-history') {
        await compactHistory(payload);
      } else if (type === 'rehydrate') {
        await rehydrate(payload);
      }
    }
  });
}

module.exports = {
  registerSdkCommandForwardingHandler,
};
