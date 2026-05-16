import { buildModelSettingsPatch } from '../../infrastructure/api/windieSdkClient';

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
  'appearance_mode',
  'appearance_theme',
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
  const selection = buildDeferredQueryModelSelection(config);
  if (!selection) {
    return null;
  }
  return buildModelSettingsPatch(selection, 'buildDeferredQueryModelConfig');
}

export function buildDeferredQueryModelSelection(config) {
  if (!isPlainObject(config)) {
    return null;
  }
  const modelId = typeof config.selected_model_id === 'string'
    ? config.selected_model_id.trim()
    : '';
  const modelProvider = typeof config.model_provider === 'string'
    ? config.model_provider.trim()
    : '';
  if (!modelId || !modelProvider) {
    return null;
  }
  return {
    modelId,
    modelProvider,
  };
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
