const {
  clearPendingSettingsSyncs,
  isValidConfigPayload,
  resolveSettingsSync,
  waitForSettingsAck,
} = require('./ipc_settings_sync.cjs');

function buildBackendSettingsPayload(config) {
  if (!isValidConfigPayload(config)) {
    return null;
  }
  const backendConfig = { ...config };
  delete backendConfig.global_agent_stop_shortcut;
  return backendConfig;
}

function createIpcSettingsSyncRuntime({
  getLatestFrontendConfig,
  setLatestFrontendConfig,
  loadCachedFrontendConfig,
  isConnected,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  getRuntime,
  sendSdkRuntimeCommand,
  log = () => {},
  timeoutMs = 2500,
} = {}) {
  let hasAttemptedInitialSettingsSync = false;
  let pendingSettingsSyncPromise = null;
  const pendingSettingsSyncs = new Map();

  function reset() {
    hasAttemptedInitialSettingsSync = false;
    pendingSettingsSyncPromise = null;
    clearPendingSettingsSyncs(pendingSettingsSyncs);
  }

  function resolveAck(msgId, wasSuccessful) {
    resolveSettingsSync(pendingSettingsSyncs, msgId, wasSuccessful);
  }

  async function waitForPendingSync() {
    if (pendingSettingsSyncPromise) {
      await pendingSettingsSyncPromise;
      return true;
    }
    return false;
  }

  async function sendSettingsUpdate(config, source = 'renderer') {
    const backendConfig = buildBackendSettingsPayload(config);
    if (!backendConfig) {
      return Promise.resolve(false);
    }
    setLatestFrontendConfig?.({ ...config });

    if (!isBackendRuntimeConnected?.()) {
      try {
        await ensureBackendConnection?.(`update-settings:${source}`);
      } catch (error) {
        log(`Failed to connect backend for update-settings: ${error?.message || error}`);
        return false;
      }
    }

    const msgId = sendSdkRuntimeCommand?.(getRuntime?.(), {
      type: 'update-settings',
      payload: backendConfig,
    });
    if (!msgId) {
      return Promise.resolve(false);
    }

    const ackPromise = waitForSettingsAck(
      pendingSettingsSyncs,
      msgId,
      source,
      log,
      timeoutMs,
    );
    pendingSettingsSyncPromise = ackPromise.finally(() => {
      if (pendingSettingsSyncPromise === ackPromise) {
        pendingSettingsSyncPromise = null;
      }
    });
    return pendingSettingsSyncPromise;
  }

  async function ensureInitialSettingsSync() {
    if (!isConnected?.()) {
      return;
    }

    if (hasAttemptedInitialSettingsSync) {
      await waitForPendingSync();
      return;
    }
    hasAttemptedInitialSettingsSync = true;

    let latestFrontendConfig = getLatestFrontendConfig?.() || null;
    if (!isValidConfigPayload(latestFrontendConfig)) {
      latestFrontendConfig = await loadCachedFrontendConfig?.();
      if (isValidConfigPayload(latestFrontendConfig)) {
        setLatestFrontendConfig?.(latestFrontendConfig);
      }
    }

    await waitForPendingSync();
    if (isValidConfigPayload(latestFrontendConfig)) {
      await sendSettingsUpdate(latestFrontendConfig, 'initial-query-gate');
    }
  }

  return {
    buildBackendSettingsPayload,
    ensureInitialSettingsSync,
    reset,
    resolveAck,
    sendSettingsUpdate,
    waitForPendingSync,
  };
}

module.exports = {
  buildBackendSettingsPayload,
  createIpcSettingsSyncRuntime,
};
