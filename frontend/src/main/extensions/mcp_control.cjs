/**
 * Provides the mcp control module for the Electron main process.
 */

const {
  loadExtensionMcpServers,
  loadPublicExtensionRegistry,
} = require('./extension_manifest.cjs');
const {
  clearMcpRuntimeCache,
  createMcpToolName,
} = require('./mcp_runtime.cjs');
const {
  appendDiagnosticEvent,
  MCP_DISCOVERY_DIAGNOSTICS_PATH,
  MCP_ENABLEMENT_DIAGNOSTICS_PATH,
} = require('../diagnostics/app_diagnostics_store.cjs');

const MCP_ENABLED_CONFIG_KEY = 'agent_enabled_mcp_servers';

let lastDiscoveryStatusByServerId = new Map();

function createDiagnosticId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeEnabledMcpServers(value) {
  const source = Array.isArray(value) ? value : [];
  const enabled = [];
  const seen = new Set();
  for (const item of source) {
    const normalized = normalizeString(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    enabled.push(normalized);
  }
  return enabled;
}

function getEnabledMcpServersFromConfig(config) {
  return normalizeEnabledMcpServers(config?.[MCP_ENABLED_CONFIG_KEY]);
}

function isMcpServerUserEnabled(server, enabledServers) {
  const enabled = new Set(enabledServers);
  return [server.id, server.mcp_id, server.extension_id]
    .filter(Boolean)
    .some((id) => enabled.has(id));
}

function setMcpServerEnabledInConfig(config, serverId, enabled) {
  const normalizedServerId = normalizeString(serverId);
  if (!normalizedServerId) {
    return config && typeof config === 'object' ? { ...config } : {};
  }
  const current = getEnabledMcpServersFromConfig(config);
  const next = enabled
    ? [...new Set([...current, normalizedServerId])]
    : current.filter((id) => id !== normalizedServerId);
  return {
    ...(config && typeof config === 'object' && !Array.isArray(config) ? config : {}),
    [MCP_ENABLED_CONFIG_KEY]: next,
  };
}

function getServerStatus(server, effectiveEnabled, discoveryStatus) {
  if (!effectiveEnabled) {
    return {
      state: 'off',
      label: 'Off',
      reason: server.requires_user_enable ? 'Explicit enablement required.' : '',
    };
  }
  if (discoveryStatus?.state === 'error') {
    const reason = discoveryStatus.reason || 'Discovery failed.';
    const lowerReason = reason.toLowerCase();
    if (
      server.id === 'cua-driver'
      && (
        lowerReason.includes('enoent')
        || lowerReason.includes('not found')
        || lowerReason.includes('no such file')
      )
    ) {
      return {
        state: 'not_installed',
        label: 'Not installed',
        reason,
      };
    }
    if (
      server.id === 'cua-driver'
      && (
        lowerReason.includes('accessibility')
        || lowerReason.includes('permission')
        || lowerReason.includes('screen recording')
        || lowerReason.includes('tcc')
      )
    ) {
      return {
        state: 'needs_permission',
        label: 'Needs permission',
        reason,
      };
    }
    return {
      state: 'error',
      label: 'Error',
      reason,
    };
  }
  if (discoveryStatus?.state === 'ready') {
    return {
      state: 'ready',
      label: 'Ready',
      reason: '',
      ...(Number.isFinite(discoveryStatus.tool_count) ? { tool_count: discoveryStatus.tool_count } : {}),
    };
  }
  return {
    state: 'unknown',
    label: 'Unknown',
    reason: 'Discovery has not been refreshed.',
  };
}

function annotateMcpServers(servers, enabledServers, statusByServerId = lastDiscoveryStatusByServerId) {
  return servers.map((server) => {
    const userEnabled = isMcpServerUserEnabled(server, enabledServers);
    const effectiveEnabled = server.requires_user_enable ? userEnabled : server.enabled !== false;
    const status = getServerStatus(server, effectiveEnabled, statusByServerId.get(server.id));
    return {
      ...server,
      user_enabled: userEnabled,
      effective_enabled: effectiveEnabled,
      status,
    };
  });
}

function listMcpServersForConfig({
  config = null,
  contributionsDir = undefined,
} = {}) {
  const registry = loadPublicExtensionRegistry({ contributionsDir });
  const enabledServers = getEnabledMcpServersFromConfig(config);
  return {
    contributionRoot: registry.contributionRoot,
    mcps: annotateMcpServers(registry.mcps || [], enabledServers),
    errors: registry.errors || [],
    enabled_mcp_servers: enabledServers,
  };
}

function getEnabledMcpServerSpecsForConfig({
  config = null,
  contributionsDir = undefined,
} = {}) {
  const enabledServers = getEnabledMcpServersFromConfig(config);
  return loadExtensionMcpServers({ contributionsDir }).filter((server) => {
    const userEnabled = isMcpServerUserEnabled(server, enabledServers);
    return server.requires_user_enable ? userEnabled : server.enabled !== false;
  });
}

function createMcpDiscoveryDiagnostics() {
  const context = {
    path: MCP_DISCOVERY_DIAGNOSTICS_PATH,
    traceId: createDiagnosticId('mcp-discovery'),
  };
  return {
    ...context,
    emit: async (input = {}) => {
      try {
        return appendDiagnosticEvent({
          path: context.path,
          traceId: context.traceId,
          runtime: 'electron-main',
          ...input,
        });
      } catch {
        return { stored: false };
      }
    },
  };
}

function createMcpEnablementDiagnostics() {
  const context = {
    path: MCP_ENABLEMENT_DIAGNOSTICS_PATH,
    traceId: createDiagnosticId('mcp-enable'),
  };
  return {
    ...context,
    emit: async (input = {}) => {
      try {
        return appendDiagnosticEvent({
          path: context.path,
          traceId: context.traceId,
          runtime: 'electron-main',
          ...input,
        });
      } catch {
        return { stored: false };
      }
    },
  };
}

async function emitMcpDiagnostic(diagnostics, input = {}) {
  if (!diagnostics || typeof diagnostics.emit !== 'function') {
    return { stored: false };
  }
  try {
    return await diagnostics.emit(input);
  } catch {
    return { stored: false };
  }
}

function summarizeMcpRegistry(registry = {}) {
  const mcps = Array.isArray(registry.mcps) ? registry.mcps : [];
  return {
    enabledServerCount: getEnabledMcpServersFromConfig({
      [MCP_ENABLED_CONFIG_KEY]: registry.enabled_mcp_servers,
    }).length,
    registryServerCount: mcps.length,
    registryReadyCount: mcps.filter((server) => server?.status?.state === 'ready').length,
    registryErrorCount: mcps.filter((server) => (
      server?.status?.state === 'error'
      || server?.status?.state === 'not_installed'
      || server?.status?.state === 'needs_permission'
    )).length,
    mcpToolCount: mcps.reduce((count, server) => {
      const toolCount = Number.isFinite(server?.status?.tool_count)
        ? server.status.tool_count
        : 0;
      return count + toolCount;
    }, 0),
  };
}

async function refreshMcpServersThroughSidecar({
  config = null,
  contributionsDir = undefined,
  localRuntime = null,
} = {}) {
  if (!localRuntime || typeof localRuntime.registerMcp !== 'function') {
    return null;
  }
  const registry = loadPublicExtensionRegistry({ contributionsDir });
  const enabledServers = getEnabledMcpServersFromConfig(config);
  const enabledSpecs = getEnabledMcpServerSpecsForConfig({ config, contributionsDir });
  const result = await localRuntime.registerMcp({
    servers: enabledSpecs,
    replace: true,
  });
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  const statuses = Array.isArray(result?.statuses) ? result.statuses : [];
  const tools = typeof localRuntime.listTools === 'function'
    ? await localRuntime.listTools()
    : null;
  const manifestTools = Array.isArray(tools?.tools) ? tools.tools : [];
  const nextStatusByServerId = new Map();
  for (const status of statuses) {
    const serverId = normalizeString(status?.server_id);
    if (!serverId) {
      continue;
    }
    nextStatusByServerId.set(serverId, {
      state: normalizeString(status.state) || 'unknown',
      reason: normalizeString(status.reason),
      tool_count: Number.isFinite(status.tool_count) ? status.tool_count : undefined,
    });
  }
  for (const error of errors) {
    const serverId = normalizeString(error?.server_id);
    if (serverId) {
      nextStatusByServerId.set(serverId, {
        state: 'error',
        reason: normalizeString(error.reason) || 'Discovery failed.',
      });
    }
  }
  for (const server of registry.mcps || []) {
    const discoveredCount = manifestTools.filter((tool) => (
      tool?.mcp_server_id === server.id
    )).length;
    if (discoveredCount > 0 && !nextStatusByServerId.has(server.id)) {
      nextStatusByServerId.set(server.id, {
        state: 'ready',
        tool_count: discoveredCount,
      });
    }
  }
  lastDiscoveryStatusByServerId = nextStatusByServerId;
  return {
    contributionRoot: registry.contributionRoot,
    mcps: annotateMcpServers(registry.mcps || [], enabledServers, lastDiscoveryStatusByServerId),
    errors: registry.errors || [],
    enabled_mcp_servers: enabledServers,
    mcp_errors: errors,
  };
}

async function refreshMcpServersForConfig({
  config = null,
  contributionsDir = undefined,
  localRuntime = null,
  createClient = undefined,
  spawnImpl = undefined,
  diagnostics = undefined,
} = {}) {
  const sidecarResult = await refreshMcpServersThroughSidecar({
    config,
    contributionsDir,
    localRuntime,
  });
  if (sidecarResult) {
    return sidecarResult;
  }
  const registry = loadPublicExtensionRegistry({ contributionsDir });
  const enabledServers = getEnabledMcpServersFromConfig(config);
  const { buildClientToolManifestWithMcp } = require('./mcp_runtime.cjs');
  const manifest = await buildClientToolManifestWithMcp({
    baseManifest: { version: 1, tools: [] },
    contributionsDir,
    enabledMcpServers: enabledServers,
    createClient,
    spawnImpl,
    diagnostics: diagnostics || createMcpDiscoveryDiagnostics(),
  });
  const nextStatusByServerId = new Map();
  const errors = Array.isArray(manifest.mcp_errors) ? manifest.mcp_errors : [];
  for (const error of errors) {
    const serverId = normalizeString(error?.server_id);
    if (serverId) {
      nextStatusByServerId.set(serverId, {
        state: 'error',
        reason: normalizeString(error.reason) || 'Discovery failed.',
      });
    }
  }
  for (const server of registry.mcps || []) {
    const toolNames = (server.tools || []).map((tool) => (
      createMcpToolName(server.id, tool.name, server.tool_prefix)
    ));
    const discoveredCount = (manifest.tools || []).filter((tool) => (
      tool?.mcp_server_id === server.id || toolNames.includes(tool?.name)
    )).length;
    if (discoveredCount > 0 && !nextStatusByServerId.has(server.id)) {
      nextStatusByServerId.set(server.id, {
        state: 'ready',
        tool_count: discoveredCount,
      });
    }
  }
  lastDiscoveryStatusByServerId = nextStatusByServerId;
  return {
    contributionRoot: registry.contributionRoot,
    mcps: annotateMcpServers(registry.mcps || [], enabledServers, lastDiscoveryStatusByServerId),
    errors: registry.errors || [],
    enabled_mcp_servers: enabledServers,
    mcp_errors: errors,
  };
}

async function updateMcpServerEnablementForConfig({
  config = null,
  serverId = '',
  enabled = false,
  persistConfig,
  contributionsDir = undefined,
  localRuntime = null,
  resolveLocalRuntime = null,
  createClient = undefined,
  spawnImpl = undefined,
  diagnostics = undefined,
  enablementDiagnostics = undefined,
} = {}) {
  const normalizedServerId = normalizeString(serverId);
  const enablementTrace = enablementDiagnostics || createMcpEnablementDiagnostics();
  const previousEnabledServerCount = getEnabledMcpServersFromConfig(config).length;
  if (!normalizedServerId) {
    await emitMcpDiagnostic(enablementTrace, {
      stage: 'toggle_rejected',
      status: 'failed',
      data: {
        phase: 'toggle',
        requestedEnabled: enabled === true,
        previousEnabledServerCount,
      },
      error: 'Missing MCP server id.',
    });
    return {
      success: false,
      error: 'Missing MCP server id.',
      registry: listMcpServersForConfig({ config, contributionsDir }),
    };
  }
  if (typeof persistConfig !== 'function') {
    await emitMcpDiagnostic(enablementTrace, {
      stage: 'toggle_rejected',
      status: 'failed',
      data: {
        serverId: normalizedServerId,
        phase: 'toggle',
        requestedEnabled: enabled === true,
        previousEnabledServerCount,
      },
      error: 'Missing MCP config persistence handler.',
    });
    return {
      success: false,
      error: 'Missing MCP config persistence handler.',
      registry: listMcpServersForConfig({ config, contributionsDir }),
    };
  }

  const nextConfig = setMcpServerEnabledInConfig(config || {}, normalizedServerId, enabled === true);
  const nextEnabledServerCount = getEnabledMcpServersFromConfig(nextConfig).length;
  await emitMcpDiagnostic(enablementTrace, {
    stage: 'toggle_requested',
    status: 'started',
    data: {
      serverId: normalizedServerId,
      phase: 'toggle',
      requestedEnabled: enabled === true,
      previousEnabledServerCount,
      enabledServerCount: nextEnabledServerCount,
    },
  });
  const result = await persistConfig(nextConfig);
  clearMcpControlState();

  if (result?.success === false) {
    await emitMcpDiagnostic(enablementTrace, {
      stage: 'config_persist_failed',
      status: 'failed',
      data: {
        serverId: normalizedServerId,
        phase: 'config_save',
        requestedEnabled: enabled === true,
        previousEnabledServerCount,
        enabledServerCount: nextEnabledServerCount,
      },
      error: result.error || 'Unable to update MCP server.',
    });
    return {
      success: false,
      error: result.error || 'Unable to update MCP server.',
      registry: listMcpServersForConfig({ config, contributionsDir }),
    };
  }
  await emitMcpDiagnostic(enablementTrace, {
    stage: 'config_persisted',
    status: 'succeeded',
    data: {
      serverId: normalizedServerId,
      phase: 'config_save',
      requestedEnabled: enabled === true,
      previousEnabledServerCount,
      enabledServerCount: nextEnabledServerCount,
      persistedEnabledServerCount: nextEnabledServerCount,
    },
  });
  await emitMcpDiagnostic(enablementTrace, {
    stage: 'capability_manifest.persist',
    status: 'succeeded',
    data: {
      serverId: normalizedServerId,
      contributionId: normalizedServerId,
      contributionKind: 'mcp',
      requestedEnabled: enabled === true,
      enabledContributionCount: nextEnabledServerCount,
    },
  });

  let resolvedLocalRuntime = localRuntime;
  let shouldRefreshRuntime = enabled === true || Boolean(resolvedLocalRuntime);
  let registry;
  try {
    resolvedLocalRuntime = typeof resolveLocalRuntime === 'function'
      ? await resolveLocalRuntime(nextConfig)
      : localRuntime;
    shouldRefreshRuntime = enabled === true || Boolean(resolvedLocalRuntime);
    registry = shouldRefreshRuntime
      ? await refreshMcpServersForConfig({
        config: nextConfig,
        contributionsDir,
        localRuntime: resolvedLocalRuntime,
        createClient,
        spawnImpl,
        diagnostics,
      })
      : listMcpServersForConfig({ config: nextConfig, contributionsDir });
  } catch (error) {
    await emitMcpDiagnostic(enablementTrace, {
      stage: shouldRefreshRuntime ? 'registry_refresh_failed' : 'registry_list_failed',
      status: 'failed',
      data: {
        serverId: normalizedServerId,
        phase: shouldRefreshRuntime ? 'registry_refresh' : 'registry_list',
        requestedEnabled: enabled === true,
        previousEnabledServerCount,
        enabledServerCount: nextEnabledServerCount,
      },
      error,
    });
    throw error;
  }

  await emitMcpDiagnostic(enablementTrace, {
    stage: shouldRefreshRuntime ? 'registry_refreshed' : 'registry_listed',
    status: 'succeeded',
    data: {
      serverId: normalizedServerId,
      phase: shouldRefreshRuntime ? 'registry_refresh' : 'registry_list',
      requestedEnabled: enabled === true,
      previousEnabledServerCount,
      ...summarizeMcpRegistry(registry),
    },
  });
  await emitMcpDiagnostic(enablementTrace, {
    stage: 'capability_manifest.rebuild',
    status: 'succeeded',
    data: {
      serverId: normalizedServerId,
      contributionId: normalizedServerId,
      contributionKind: 'mcp',
      requestedEnabled: enabled === true,
      registryRefresh: shouldRefreshRuntime,
      ...summarizeMcpRegistry(registry),
    },
  });

  return {
    success: true,
    registry,
  };
}

function clearMcpControlState() {
  lastDiscoveryStatusByServerId = new Map();
  clearMcpRuntimeCache();
}

module.exports = {
  MCP_ENABLED_CONFIG_KEY,
  clearMcpControlState,
  createMcpEnablementDiagnostics,
  getEnabledMcpServerSpecsForConfig,
  getEnabledMcpServersFromConfig,
  listMcpServersForConfig,
  normalizeEnabledMcpServers,
  refreshMcpServersForConfig,
  setMcpServerEnabledInConfig,
  updateMcpServerEnablementForConfig,
};
