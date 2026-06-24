/**
 * Owns the Electron-main desktop UI config runtime store.
 */

const DEFAULT_MCP_ENABLED_CONFIG_KEY = 'agent_enabled_mcp_servers';

function defaultIsValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
}

function cloneConfig(value) {
  if (!defaultIsValidConfigPayload(value)) {
    return null;
  }
  return JSON.parse(JSON.stringify(value));
}

function copyStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : null;
}

function createMcpEnablementTraceId({
  now = Date.now,
  random = Math.random,
} = {}) {
  return `mcp-enable-${now()}-${random().toString(16).slice(2)}`;
}

function createDesktopUiConfigStoreRuntime({
  mcpEnabledConfigKey = DEFAULT_MCP_ENABLED_CONFIG_KEY,
  loadDesktopUiConfigFromDisk = async () => null,
  loadDesktopUiConfigFromDiskSync = () => null,
  saveDesktopUiConfigToDisk = async () => ({ success: false, error: 'Missing save helper' }),
  redactDesktopUiConfigProviderSecrets = (config) => config,
  isValidConfigPayload = defaultIsValidConfigPayload,
  applyShortcutStatusFallbackToConfig = (config) => config,
  appendDiagnosticEvent = null,
  mcpEnablementDiagnosticsPath = null,
  log = () => {},
  now = Date.now,
  random = Math.random,
} = {}) {
  let currentConfig = null;

  function normalizeSnapshot(config) {
    if (!isValidConfigPayload(config)) {
      return null;
    }
    const withShortcutFallback = applyShortcutStatusFallbackToConfig(cloneConfig(config));
    if (!isValidConfigPayload(withShortcutFallback)) {
      return null;
    }
    return cloneConfig(redactDesktopUiConfigProviderSecrets(withShortcutFallback));
  }

  function setSnapshot(config) {
    currentConfig = normalizeSnapshot(config);
    return getSnapshot();
  }

  function getSnapshot() {
    return cloneConfig(currentConfig);
  }

  function getRawForInternalUse() {
    return currentConfig;
  }

  async function hydrate() {
    const config = await loadDesktopUiConfigFromDisk(log);
    return replaceFromDisk(config);
  }

  function hydrateSync() {
    const config = loadDesktopUiConfigFromDiskSync(log);
    return replaceFromDisk(config);
  }

  function replaceFromDisk(config) {
    return setSnapshot(config);
  }

  function loadDiskConfigSync() {
    return loadDesktopUiConfigFromDiskSync(log);
  }

  function resolveMcpEnablementPreserveSource(config, options = {}) {
    if (!isValidConfigPayload(config) || options.preserveMcpEnablement === false) {
      return 'none';
    }
    if (copyStringArray(currentConfig?.[mcpEnabledConfigKey])) {
      return 'store';
    }
    const diskConfig = loadDiskConfigSync();
    if (copyStringArray(diskConfig?.[mcpEnabledConfigKey])) {
      return 'disk';
    }
    return 'none';
  }

  function preserveMainOwnedFields(config, options = {}) {
    if (!isValidConfigPayload(config) || options.preserveMcpEnablement === false) {
      return config;
    }
    const latestEnabled = copyStringArray(currentConfig?.[mcpEnabledConfigKey]);
    const diskConfig = latestEnabled ? null : loadDiskConfigSync();
    const enabledMcpServers = latestEnabled || copyStringArray(diskConfig?.[mcpEnabledConfigKey]);
    if (!enabledMcpServers) {
      return cloneConfig(config);
    }
    return {
      ...cloneConfig(config),
      [mcpEnabledConfigKey]: enabledMcpServers,
    };
  }

  function replaceFromRenderer(config, options = {}) {
    const nextConfig = preserveMainOwnedFields(config, options);
    if (isValidConfigPayload(nextConfig)) {
      setSnapshot(nextConfig);
    }
    return getSnapshot();
  }

  function patchMainOwnedFields(patch) {
    if (!isValidConfigPayload(patch)) {
      return getSnapshot();
    }
    return setSnapshot({
      ...(currentConfig || {}),
      ...cloneConfig(patch),
    });
  }

  function getDesktopUiConfigForMcpRegistry() {
    return preserveMainOwnedFields(getSnapshot() || {});
  }

  function countMcpEnabledServersInConfig(config) {
    return copyStringArray(config?.[mcpEnabledConfigKey])?.length || 0;
  }

  function recordMcpEnablementDiagnostic(input = {}) {
    try {
      if (typeof appendDiagnosticEvent !== 'function') {
        return { stored: false };
      }
      return appendDiagnosticEvent({
        path: mcpEnablementDiagnosticsPath,
        traceId: input.traceId || createMcpEnablementTraceId({ now, random }),
        runtime: 'electron-main',
        ...input,
      });
    } catch {
      return { stored: false };
    }
  }

  async function persist(config, options = {}) {
    const preserveSource = resolveMcpEnablementPreserveSource(config, options);
    const payloadHasEnabledKey = Array.isArray(config?.[mcpEnabledConfigKey]);
    const saveConfig = preserveMainOwnedFields(config, options);
    const snapshot = replaceFromRenderer(saveConfig, {
      ...options,
      preserveMcpEnablement: false,
    });
    const result = await saveDesktopUiConfigToDisk(saveConfig, log);
    recordMcpEnablementDiagnostic({
      stage: result?.success === false ? 'config_save_failed' : 'config_saved',
      status: result?.success === false ? 'failed' : 'succeeded',
      data: {
        phase: 'config_save',
        preserveMcpEnablement: options.preserveMcpEnablement !== false,
        preserveSource,
        payloadHasEnabledKey,
        latestHasEnabledKey: Array.isArray(snapshot?.[mcpEnabledConfigKey]),
        persistedEnabledServerCount: countMcpEnabledServersInConfig(snapshot),
        payloadEnabledServerCount: countMcpEnabledServersInConfig(config),
      },
      error: result?.success === false ? result.error : null,
    });
    return result;
  }

  function reset() {
    currentConfig = null;
  }

  return {
    countMcpEnabledServersInConfig,
    getDesktopUiConfigForMcpRegistry,
    getRawForInternalUse,
    getSnapshot,
    hydrate,
    hydrateSync,
    patchMainOwnedFields,
    persist,
    recordMcpEnablementDiagnostic,
    replaceFromDisk,
    replaceFromRenderer,
    reset,
  };
}

module.exports = {
  createDesktopUiConfigStoreRuntime,
};
