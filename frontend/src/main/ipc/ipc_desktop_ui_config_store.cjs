/**
 * Owns the Electron-main desktop UI config runtime store.
 */

const DEFAULT_MCP_ENABLED_CONFIG_KEY = 'agent_enabled_mcp_servers';
const DEFAULT_PRESERVED_ABSENT_RENDERER_CONFIG_KEYS = Object.freeze([
  'agent_custom_instructions',
  'agent_disabled_local_tools',
  'agent_disabled_remote_tools',
]);

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

function hasOwnConfigKey(config, key) {
  return Boolean(
    config
    && typeof config === 'object'
    && !Array.isArray(config)
    && Object.prototype.hasOwnProperty.call(config, key),
  );
}

function copyPreservedConfigValue(config, key) {
  if (!hasOwnConfigKey(config, key)) {
    return undefined;
  }
  const value = config[key];
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return value;
  }
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function hasMeaningfulPreservedConfigValue(config, key) {
  if (!hasOwnConfigKey(config, key)) {
    return false;
  }
  const value = config[key];
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return value !== undefined && value !== null;
}

function createMcpEnablementTraceId({
  now = Date.now,
  random = Math.random,
} = {}) {
  return `mcp-enable-${now()}-${random().toString(16).slice(2)}`;
}

function createDesktopUiConfigStoreRuntime({
  mcpEnabledConfigKey = DEFAULT_MCP_ENABLED_CONFIG_KEY,
  preservedAbsentRendererConfigKeys = DEFAULT_PRESERVED_ABSENT_RENDERER_CONFIG_KEYS,
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
  const trustedLiveEmptyPreservedConfigKeys = new Set();

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

  function updateTrustedLiveEmptyPreservedConfigKeys(config, options = {}) {
    if (!isValidConfigPayload(config)) {
      return;
    }
    preservedAbsentRendererConfigKeys.forEach((key) => {
      if (!hasOwnConfigKey(config, key)) {
        return;
      }
      if (hasMeaningfulPreservedConfigValue(config, key)) {
        trustedLiveEmptyPreservedConfigKeys.delete(key);
        return;
      }
      if (options.trustExplicitEmptyPreservedConfig === true) {
        trustedLiveEmptyPreservedConfigKeys.add(key);
        return;
      }
      trustedLiveEmptyPreservedConfigKeys.delete(key);
    });
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
    trustedLiveEmptyPreservedConfigKeys.clear();
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

  function preserveAbsentRendererConfigFields(config, sourceConfig) {
    if (!isValidConfigPayload(config) || !isValidConfigPayload(sourceConfig)) {
      return config;
    }
    const nextConfig = cloneConfig(config);
    preservedAbsentRendererConfigKeys.forEach((key) => {
      if (hasOwnConfigKey(nextConfig, key)) {
        return;
      }
      const sourceValue = copyPreservedConfigValue(sourceConfig, key);
      if (sourceValue !== undefined) {
        nextConfig[key] = sourceValue;
      }
    });
    return nextConfig;
  }

  function preserveMainOwnedFields(config, options = {}) {
    if (!isValidConfigPayload(config)) {
      return config;
    }
    let nextConfig = cloneConfig(config);
    if (options.preserveAbsentRendererConfig !== false) {
      nextConfig = preserveAbsentRendererConfigFields(nextConfig, currentConfig);
    }

    const needsDiskPreserve = (
      options.preserveAbsentRendererConfig !== false
      && !currentConfig
      && preservedAbsentRendererConfigKeys.some((key) => !hasOwnConfigKey(nextConfig, key))
    );
    const latestEnabled = copyStringArray(currentConfig?.[mcpEnabledConfigKey]);
    const diskConfig = (latestEnabled && !needsDiskPreserve) ? null : loadDiskConfigSync();
    if (options.preserveAbsentRendererConfig !== false && diskConfig) {
      nextConfig = preserveAbsentRendererConfigFields(nextConfig, diskConfig);
    }

    if (options.preserveMcpEnablement === false) {
      return nextConfig;
    }
    const enabledMcpServers = latestEnabled || copyStringArray(diskConfig?.[mcpEnabledConfigKey]);
    if (!enabledMcpServers) {
      return nextConfig;
    }
    return {
      ...nextConfig,
      [mcpEnabledConfigKey]: enabledMcpServers,
    };
  }

  function replaceFromRenderer(config, options = {}) {
    const nextConfig = preserveMainOwnedFields(config, options);
    if (isValidConfigPayload(nextConfig)) {
      setSnapshot(nextConfig);
      updateTrustedLiveEmptyPreservedConfigKeys(nextConfig, options);
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

  function getDesktopUiConfigForAgentDefinition() {
    const snapshot = getSnapshot() || {};
    const diskConfig = loadDiskConfigSync();
    if (!isValidConfigPayload(diskConfig)) {
      return Object.keys(snapshot).length > 0 ? snapshot : null;
    }

    let nextConfig = preserveAbsentRendererConfigFields(snapshot, diskConfig);
    preservedAbsentRendererConfigKeys.forEach((key) => {
      if (
        trustedLiveEmptyPreservedConfigKeys.has(key)
        || hasMeaningfulPreservedConfigValue(nextConfig, key)
        || !hasMeaningfulPreservedConfigValue(diskConfig, key)
      ) {
        return;
      }
      const diskValue = copyPreservedConfigValue(diskConfig, key);
      if (diskValue !== undefined) {
        nextConfig = {
          ...nextConfig,
          [key]: diskValue,
        };
      }
    });
    return normalizeSnapshot(nextConfig);
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
      trustExplicitEmptyPreservedConfig: true,
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
    trustedLiveEmptyPreservedConfigKeys.clear();
  }

  return {
    countMcpEnabledServersInConfig,
    getDesktopUiConfigForAgentDefinition,
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
