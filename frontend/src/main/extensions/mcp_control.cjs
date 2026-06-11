const {
  loadPublicExtensionRegistry,
} = require('./extension_manifest.cjs');
const {
  buildClientToolManifestWithMcp,
  clearMcpRuntimeCache,
  createMcpToolName,
} = require('./mcp_runtime.cjs');
const {
  appendDiagnosticEvent,
  MCP_DISCOVERY_DIAGNOSTICS_PATH,
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

async function refreshMcpServersForConfig({
  config = null,
  contributionsDir = undefined,
  createClient = undefined,
  spawnImpl = undefined,
  diagnostics = undefined,
} = {}) {
  const registry = loadPublicExtensionRegistry({ contributionsDir });
  const enabledServers = getEnabledMcpServersFromConfig(config);
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
  createClient = undefined,
  spawnImpl = undefined,
  diagnostics = undefined,
} = {}) {
  const normalizedServerId = normalizeString(serverId);
  if (!normalizedServerId) {
    return {
      success: false,
      error: 'Missing MCP server id.',
      registry: listMcpServersForConfig({ config, contributionsDir }),
    };
  }
  if (typeof persistConfig !== 'function') {
    return {
      success: false,
      error: 'Missing MCP config persistence handler.',
      registry: listMcpServersForConfig({ config, contributionsDir }),
    };
  }

  const nextConfig = setMcpServerEnabledInConfig(config || {}, normalizedServerId, enabled === true);
  const result = await persistConfig(nextConfig);
  clearMcpControlState();

  if (result?.success === false) {
    return {
      success: false,
      error: result.error || 'Unable to update MCP server.',
      registry: listMcpServersForConfig({ config, contributionsDir }),
    };
  }

  const registry = enabled === true
    ? await refreshMcpServersForConfig({
      config: nextConfig,
      contributionsDir,
      createClient,
      spawnImpl,
      diagnostics,
    })
    : listMcpServersForConfig({ config: nextConfig, contributionsDir });

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
  getEnabledMcpServersFromConfig,
  listMcpServersForConfig,
  normalizeEnabledMcpServers,
  refreshMcpServersForConfig,
  setMcpServerEnabledInConfig,
  updateMcpServerEnablementForConfig,
};
