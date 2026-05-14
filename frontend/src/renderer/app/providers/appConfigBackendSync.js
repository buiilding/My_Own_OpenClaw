const DEFERRED_QUERY_MODEL_CONFIG_KEYS = new Set([
  'model_provider',
  'selected_model_id',
]);
const LOCAL_ONLY_FRONTEND_CONFIG_KEYS = new Set([
  'global_agent_stop_shortcut',
  'show_tool_logs',
  'agent_custom_instructions',
  'agent_disabled_local_tools',
  'agent_disabled_remote_tools',
  'agent_coordinate_methods',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickConfigKeys(config, predicate) {
  if (!isPlainObject(config)) {
    return null;
  }

  const entries = Object.entries(config).filter(([key, value]) => (
    value !== undefined && predicate(key)
  ));
  if (entries.length === 0) {
    return null;
  }
  return Object.fromEntries(entries);
}

export function buildDeferredQueryModelConfig(config) {
  return pickConfigKeys(config, (key) => DEFERRED_QUERY_MODEL_CONFIG_KEYS.has(key));
}

export function buildImmediateBackendConfig(config) {
  return pickConfigKeys(config, (key) => (
    !DEFERRED_QUERY_MODEL_CONFIG_KEYS.has(key)
    && !LOCAL_ONLY_FRONTEND_CONFIG_KEYS.has(key)
  ));
}

export function hasImmediateBackendConfigChanges(previousConfig, nextConfig) {
  const previous = isPlainObject(previousConfig) ? previousConfig : {};
  const next = isPlainObject(nextConfig) ? nextConfig : {};
  const keys = new Set([
    ...Object.keys(previous),
    ...Object.keys(next),
  ]);

  for (const key of keys) {
    if (DEFERRED_QUERY_MODEL_CONFIG_KEYS.has(key)) {
      continue;
    }
    if (LOCAL_ONLY_FRONTEND_CONFIG_KEYS.has(key)) {
      continue;
    }
    if (previous[key] !== next[key]) {
      return true;
    }
  }

  return false;
}
