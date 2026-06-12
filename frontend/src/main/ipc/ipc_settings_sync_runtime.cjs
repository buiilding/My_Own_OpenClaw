const {
  clearPendingSettingsSyncs,
  isValidConfigPayload,
  resolveSettingsSync,
  waitForSettingsAck,
} = require('./ipc_settings_sync.cjs');
const {
  filterBackendPayload,
} = require('./ipc_backend_payload_contract.cjs');

const MCP_ENABLED_CONFIG_KEY = 'agent_enabled_mcp_servers';

function buildBackendSettingsPayload(config) {
  if (!isValidConfigPayload(config)) {
    return null;
  }
  return filterBackendPayload('update-settings', config);
}

function copyStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : null;
}

function createIpcSettingsSyncRuntime({
  getLatestFrontendConfig,
  setLatestFrontendConfig,
  loadCachedFrontendConfig,
  isConnected,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  updateSettings,
  traceSettingsUpdate = null,
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

  function getPendingSettingsSyncPromise() {
    return pendingSettingsSyncPromise;
  }

  function resolveAck(msgId, wasSuccessful) {
    resolveSettingsSync(pendingSettingsSyncs, msgId, wasSuccessful);
  }

  async function preserveLocalOnlyConfigFields(config) {
    if (!isValidConfigPayload(config)) {
      return config;
    }
    if (Array.isArray(config[MCP_ENABLED_CONFIG_KEY])) {
      return { ...config };
    }

    const latestEnabled = copyStringArray(getLatestFrontendConfig?.()?.[MCP_ENABLED_CONFIG_KEY]);
    if (latestEnabled) {
      return {
        ...config,
        [MCP_ENABLED_CONFIG_KEY]: latestEnabled,
      };
    }

    try {
      const cachedConfig = await loadCachedFrontendConfig?.();
      const cachedEnabled = copyStringArray(cachedConfig?.[MCP_ENABLED_CONFIG_KEY]);
      if (cachedEnabled) {
        return {
          ...config,
          [MCP_ENABLED_CONFIG_KEY]: cachedEnabled,
        };
      }
    } catch (error) {
      log(`Failed to load cached frontend config while preserving local fields: ${error?.message || error}`);
    }

    return { ...config };
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
    setLatestFrontendConfig?.(await preserveLocalOnlyConfigFields(config));

    if (!isBackendRuntimeConnected?.()) {
      try {
        await ensureBackendConnection?.(`update-settings:${source}`);
      } catch (error) {
        log(`Failed to connect backend for update-settings: ${error?.message || error}`);
        return false;
      }
    }

    const msgId = await updateSettings?.(backendConfig);
    if (!msgId) {
      return Promise.resolve(false);
    }
    if (typeof traceSettingsUpdate === 'function') {
      traceSettingsUpdate(backendConfig, source, msgId);
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

    let config = getLatestFrontendConfig?.();
    if (!config) {
      try {
        config = await loadCachedFrontendConfig?.();
        if (config) {
          setLatestFrontendConfig?.({ ...config });
        }
      } catch (error) {
        log(`Failed to load cached frontend config for initial settings sync: ${error?.message || error}`);
      }
    }
    if (!config) {
      return;
    }
    await sendSettingsUpdate(config, 'initial-sync');
  }

  return {
    buildBackendSettingsPayload,
    ensureInitialSettingsSync,
    getPendingSettingsSyncPromise,
    reset,
    resolveAck,
    sendSettingsUpdate,
    waitForPendingSync,
  };
}

function createSettingsSyncRuntime({
  getConnected,
  getLatestFrontendConfig,
  setLatestFrontendConfig,
  loadCachedFrontendConfigFromDisk,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  updateSettings,
  traceSettingsUpdate,
  timeoutMs,
  log,
} = {}) {
  return createIpcSettingsSyncRuntime({
    getLatestFrontendConfig,
    setLatestFrontendConfig,
    loadCachedFrontendConfig: loadCachedFrontendConfigFromDisk,
    isConnected: getConnected,
    isBackendRuntimeConnected,
    ensureBackendConnection,
    updateSettings,
    traceSettingsUpdate,
    timeoutMs,
    log,
  });
}

module.exports = {
  buildBackendSettingsPayload,
  createIpcSettingsSyncRuntime,
  createSettingsSyncRuntime,
};
