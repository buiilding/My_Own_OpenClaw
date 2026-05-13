const HANDSHAKE_AVAILABLE_TOOLS = Object.freeze([
  'browser',
  'get_open_windows',
  'get_system_stats',
  'keyboard_control',
  'mouse_control',
  'open_app',
  'process',
  'read_file',
  'replace',
  'run_shell_command',
  'screenshot',
  'scroll_control',
  'switch_window',
  'wait',
  'web_search',
]);

const HANDSHAKE_AVAILABLE_COORDINATE_METHODS = Object.freeze([
  'manual',
  'ocr',
  'prediction',
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

  const coordinateMethods = normalizeStringList(policy.coordinate_methods);
  if (coordinateMethods) {
    normalized.coordinate_methods = coordinateMethods;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function buildAgentCapabilityHandshakePayload(options = {}) {
  const availableTools = normalizeStringList(options.availableTools)
    || [...HANDSHAKE_AVAILABLE_TOOLS];
  const availableCoordinateMethods = normalizeStringList(options.availableCoordinateMethods)
    || [...HANDSHAKE_AVAILABLE_COORDINATE_METHODS];
  const requestedAgentPolicy = normalizeRequestedAgentPolicy(options.requestedAgentPolicy);

  const payload = {
    available_tools: availableTools,
    available_coordinate_methods: availableCoordinateMethods,
  };
  if (requestedAgentPolicy) {
    payload.requested_agent_policy = requestedAgentPolicy;
  }
  return payload;
}

module.exports = {
  HANDSHAKE_AVAILABLE_COORDINATE_METHODS,
  HANDSHAKE_AVAILABLE_TOOLS,
  buildAgentCapabilityHandshakePayload,
};
