/**
 * Coordinates the ipc settings sync runtime for the Electron main process.
 */

const {
  isValidConfigPayload,
} = require('./ipc_settings_sync.cjs');
const {
  filterBackendPayload,
} = require('../../../../packages/windie-sdk-js/cjs/transport/backendPayloadContract.js');

const MCP_ENABLED_CONFIG_KEY = 'agent_enabled_mcp_servers';

function clearPendingSettingsSyncs(pendingSettingsSyncs) {
  for (const { resolve, timer } of pendingSettingsSyncs.values()) {
    clearTimeout(timer);
    resolve(false);
  }
  pendingSettingsSyncs.clear();
}

function resolveSettingsAck(pendingSettingsSyncs, msgId, wasSuccessful) {
  const pending = pendingSettingsSyncs.get(msgId);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pendingSettingsSyncs.delete(msgId);
  pending.resolve(Boolean(wasSuccessful));
}

function waitForSettingsAck(
  pendingSettingsSyncs,
  msgId,
  source,
  log,
  timeoutMs,
) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingSettingsSyncs.delete(msgId);
      log(`Settings sync timeout (${source}) for message ${msgId}`);
      resolve(false);
    }, timeoutMs);
    timer.unref?.();
    pendingSettingsSyncs.set(msgId, { resolve, timer });
  });
}

function buildBackendSettingsPayload(config) {
  if (!isValidConfigPayload(config)) {
    return null;
  }
  return filterBackendPayload('update-settings', config);
}

function redactProviderApiKeysForTrace(config) {
  if (!isValidConfigPayload(config) || !isValidConfigPayload(config.provider_api_keys)) {
    return config;
  }
  return {
    ...config,
    provider_api_keys: Object.fromEntries(
      Object.entries(config.provider_api_keys).map(([provider, entry]) => [
        provider,
        isValidConfigPayload(entry) ? { ...entry, api_key: '' } : entry,
      ]),
    ),
  };
}

function copyStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : null;
}

function createIpcSettingsSyncRuntime({
  getLatestDesktopUiConfig,
  replaceDesktopUiConfigFromRenderer,
  loadCachedDesktopUiConfig,
  isConnected,
  isBackendRuntimeConnected,
  ensureBackendConnection,
  updateSettings,
  hydrateProviderApiKeySecretsForBackendSettings = (config) => config,
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
    resolveSettingsAck(pendingSettingsSyncs, msgId, wasSuccessful);
  }

  async function preserveLocalOnlyConfigFields(config) {
    if (!isValidConfigPayload(config)) {
      return config;
    }
    if (Array.isArray(config[MCP_ENABLED_CONFIG_KEY])) {
      return { ...config };
    }

    const latestEnabled = copyStringArray(getLatestDesktopUiConfig?.()?.[MCP_ENABLED_CONFIG_KEY]);
    if (latestEnabled) {
      return {
        ...config,
        [MCP_ENABLED_CONFIG_KEY]: latestEnabled,
      };
    }

    try {
      const cachedConfig = await loadCachedDesktopUiConfig?.();
      const cachedEnabled = copyStringArray(cachedConfig?.[MCP_ENABLED_CONFIG_KEY]);
      if (cachedEnabled) {
        return {
          ...config,
          [MCP_ENABLED_CONFIG_KEY]: cachedEnabled,
        };
      }
    } catch (error) {
      log(`Failed to load cached desktop UI config while preserving local fields: ${error?.message || error}`);
    }

    return { ...config };
  }

  function hydrateBackendSettingsConfig(config) {
    if (!isValidConfigPayload(config)) {
      return config;
    }
    try {
      const hydrated = hydrateProviderApiKeySecretsForBackendSettings(config, log);
      return isValidConfigPayload(hydrated) ? hydrated : config;
    } catch (error) {
      log(`Failed to hydrate provider credentials for settings sync: ${error?.message || error}`);
      return config;
    }
  }

  async function waitForPendingSync() {
    if (pendingSettingsSyncPromise) {
      await pendingSettingsSyncPromise;
      return true;
    }
    return false;
  }

  async function sendSettingsUpdate(config, source = 'renderer') {
    if (!isValidConfigPayload(config)) {
      return Promise.resolve(false);
    }
    const configForStore = await preserveLocalOnlyConfigFields(config);
    const backendConfig = buildBackendSettingsPayload(
      hydrateBackendSettingsConfig(configForStore),
    );
    if (!backendConfig) {
      return Promise.resolve(false);
    }
    replaceDesktopUiConfigFromRenderer?.(configForStore);

    if (!isBackendRuntimeConnected?.()) {
      try {
        await ensureBackendConnection?.(`update-settings:${source}`);
      } catch (error) {
        log(`Failed to connect Agent SDK runtime for update-settings: ${error?.message || error}`);
        return false;
      }
    }

    const msgId = await updateSettings?.(backendConfig);
    if (!msgId) {
      return Promise.resolve(false);
    }
    if (typeof traceSettingsUpdate === 'function') {
      traceSettingsUpdate(redactProviderApiKeysForTrace(backendConfig), source, msgId);
    }

    const ackPromise = waitForSettingsAck(
      pendingSettingsSyncs,
      msgId,
      source,
      log,
      timeoutMs,
    );
    const trackedAckPromise = ackPromise.finally(() => {
      if (pendingSettingsSyncPromise === trackedAckPromise) {
        pendingSettingsSyncPromise = null;
      }
    });
    pendingSettingsSyncPromise = trackedAckPromise;
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

    let config = getLatestDesktopUiConfig?.();
    if (!config) {
      try {
        config = await loadCachedDesktopUiConfig?.();
        if (config) {
          replaceDesktopUiConfigFromRenderer?.({ ...config });
        }
      } catch (error) {
        log(`Failed to load cached desktop UI config for initial settings sync: ${error?.message || error}`);
      }
    }
    if (!config) {
      return;
    }
    await sendSettingsUpdate(config, 'initial-sync');
  }

  return {
    ensureInitialSettingsSync,
    getPendingSettingsSyncPromise,
    reset,
    resolveAck,
    sendSettingsUpdate,
    waitForPendingSync,
  };
}

module.exports = {
  createIpcSettingsSyncRuntime,
};
