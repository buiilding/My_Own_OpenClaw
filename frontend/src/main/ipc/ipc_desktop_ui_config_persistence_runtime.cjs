/**
 * Owns desktop UI config persistence semantics for Electron main.
 */

const DEFAULT_MCP_ENABLED_CONFIG_KEY = 'agent_enabled_mcp_servers';

function defaultIsValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
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

function createDesktopUiConfigPersistenceRuntime({
  mcpEnabledConfigKey = DEFAULT_MCP_ENABLED_CONFIG_KEY,
  getLatestDesktopUiConfig = () => null,
  setLatestDesktopUiConfig = () => {},
  loadDesktopUiConfigFromDiskSync = () => null,
  redactDesktopUiConfigProviderSecrets = (config) => config,
  saveDesktopUiConfigToDisk = async () => ({ success: false, error: 'Missing save helper' }),
  isValidConfigPayload = defaultIsValidConfigPayload,
  appendDiagnosticEvent = null,
  mcpEnablementDiagnosticsPath = null,
  log = () => {},
  now = Date.now,
  random = Math.random,
} = {}) {
  function loadDiskConfig() {
    return loadDesktopUiConfigFromDiskSync(log);
  }

  function preserveMainOwnedDesktopUiConfigFields(config, options = {}) {
    const {
      preserveMcpEnablement = true,
    } = options;
    if (!isValidConfigPayload(config)) {
      return config;
    }
    if (!preserveMcpEnablement) {
      return config;
    }
    const latestConfig = getLatestDesktopUiConfig();
    const latestEnabled = copyStringArray(latestConfig?.[mcpEnabledConfigKey]);
    const diskConfig = latestEnabled ? null : loadDiskConfig();
    const enabledMcpServers = latestEnabled || copyStringArray(diskConfig?.[mcpEnabledConfigKey]);
    if (!enabledMcpServers) {
      return config;
    }
    return {
      ...config,
      [mcpEnabledConfigKey]: enabledMcpServers,
    };
  }

  function getDesktopUiConfigForMcpRegistry() {
    return preserveMainOwnedDesktopUiConfigFields(getLatestDesktopUiConfig() || {});
  }

  function countMcpEnabledServersInConfig(config) {
    return copyStringArray(config?.[mcpEnabledConfigKey])?.length || 0;
  }

  function resolveMcpEnablementPreserveSource(config, options = {}) {
    if (!isValidConfigPayload(config) || options.preserveMcpEnablement === false) {
      return 'none';
    }
    if (copyStringArray(getLatestDesktopUiConfig()?.[mcpEnabledConfigKey])) {
      return 'latest';
    }
    const diskConfig = loadDiskConfig();
    if (copyStringArray(diskConfig?.[mcpEnabledConfigKey])) {
      return 'disk';
    }
    return 'none';
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

  async function persistDesktopUiConfigToDisk(config, options = {}) {
    const preserveSource = resolveMcpEnablementPreserveSource(config, options);
    const payloadHasEnabledKey = Array.isArray(config?.[mcpEnabledConfigKey]);
    const persistableConfig = redactDesktopUiConfigProviderSecrets(
      preserveMainOwnedDesktopUiConfigFields(config, options),
    );
    const result = await saveDesktopUiConfigToDisk(persistableConfig, log);
    recordMcpEnablementDiagnostic({
      stage: result?.success === false ? 'config_save_failed' : 'config_saved',
      status: result?.success === false ? 'failed' : 'succeeded',
      data: {
        phase: 'config_save',
        preserveMcpEnablement: options.preserveMcpEnablement !== false,
        preserveSource,
        payloadHasEnabledKey,
        latestHasEnabledKey: Array.isArray(getLatestDesktopUiConfig()?.[mcpEnabledConfigKey]),
        persistedEnabledServerCount: countMcpEnabledServersInConfig(persistableConfig),
        payloadEnabledServerCount: countMcpEnabledServersInConfig(config),
      },
      error: result?.success === false ? result.error : null,
    });
    if (
      result?.success
      && persistableConfig
      && typeof persistableConfig === 'object'
      && !Array.isArray(persistableConfig)
    ) {
      setLatestDesktopUiConfig({ ...persistableConfig });
    }
    return result;
  }

  return {
    countMcpEnabledServersInConfig,
    getDesktopUiConfigForMcpRegistry,
    persistDesktopUiConfigToDisk,
    preserveMainOwnedDesktopUiConfigFields,
    recordMcpEnablementDiagnostic,
    resolveMcpEnablementPreserveSource,
  };
}

module.exports = {
  createDesktopUiConfigPersistenceRuntime,
};
