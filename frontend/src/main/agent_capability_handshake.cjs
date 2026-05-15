const {
  buildClientToolManifest,
  getBuiltinClientToolNames,
  getClientToolNames,
} = require('./tool_manifest.cjs');
const { buildAgentDefinition } = require('./agent_definition.cjs');

const HANDSHAKE_REMOTE_TOOLS = Object.freeze([
  'web_search',
]);

function normalizeStringList(values) {
  if (!Array.isArray(values)) {
    return null;
  }
  const normalized = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const item = value.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function normalizeRequestedAgentPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return null;
  }

  const normalized = {};
  if (typeof policy.profile === 'string' && policy.profile.trim()) {
    normalized.profile = policy.profile.trim();
  }

  const disabledTools = normalizeStringList(policy.disabled_tools);
  if (disabledTools) {
    normalized.disabled_tools = disabledTools;
  }

  const disabledCapabilities = normalizeStringList(policy.disabled_capabilities);
  if (disabledCapabilities) {
    normalized.disabled_capabilities = disabledCapabilities;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function buildAgentCapabilityHandshakePayload(options = {}) {
  const clientToolManifest = options.clientToolManifest
    || buildClientToolManifest({
      disabledTools: normalizeStringList(options.disabledTools) || [],
      extensionsDir: options.extensionsDir,
    });
  const clientToolNames = Array.isArray(clientToolManifest?.tools)
    ? clientToolManifest.tools
      .map((tool) => (typeof tool?.name === 'string' ? tool.name.trim() : ''))
      .filter(Boolean)
    : getClientToolNames();
  const availableTools = normalizeStringList(options.availableTools)
    || [...clientToolNames, ...HANDSHAKE_REMOTE_TOOLS];
  const requestedAgentPolicy = normalizeRequestedAgentPolicy(options.requestedAgentPolicy);
  const operatingSystem = typeof options.operatingSystem === 'string'
    ? options.operatingSystem.trim()
    : '';
  const agentDefinition = options.agentDefinition || buildAgentDefinition({
    id: options.agentId,
    name: options.agentName,
    systemPrompt: options.systemPrompt,
    customInstructions: options.customInstructions,
    clientToolManifest,
    availableTools,
    enabledRemoteTools: HANDSHAKE_REMOTE_TOOLS,
    disabledTools: normalizeStringList(options.disabledTools) || [],
    disabledCapabilities: requestedAgentPolicy?.disabled_capabilities || [],
    operatingSystem,
    promptLayers: options.promptLayers,
    skills: options.skills,
    agentsMd: options.agentsMd,
    plugins: options.plugins,
    extensionsDir: options.extensionsDir,
  });

  const payload = {
    available_tools: availableTools,
    client_tool_manifest: clientToolManifest,
    agent_definition: agentDefinition,
  };
  if (requestedAgentPolicy) {
    payload.requested_agent_policy = requestedAgentPolicy;
  }
  return payload;
}

module.exports = {
  HANDSHAKE_AVAILABLE_TOOLS: Object.freeze([
    ...getBuiltinClientToolNames(),
    ...HANDSHAKE_REMOTE_TOOLS,
  ]),
  buildAgentCapabilityHandshakePayload,
};
