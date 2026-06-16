/**
 * Defines ipc backend payload contract contracts for the Electron main process.
 */

const BACKEND_PAYLOAD_KEYS_BY_TYPE = Object.freeze({
  query: Object.freeze([
    'text',
    'conversation_ref',
    'content',
    'screenshot',
    'screenshot_ref',
    'screenshot_refs',
    'capture_meta',
    'system_state_internal',
    'workspace_path',
    'repo_instruction_messages',
    'client_prompt_layers',
    'agent_definition',
  ]),
  'stop-query': Object.freeze([
    'conversation_ref',
    'turn_ref',
  ]),
  'rehydrate-conversation': Object.freeze([
    'conversation_ref',
    'messages',
    'rehydrate_mode',
    'workspace_path',
    'repo_instruction_messages',
  ]),
  'load-settings': Object.freeze([
    'client_version',
  ]),
  'list-models': Object.freeze([]),
  'update-settings': Object.freeze([
    'model_mode',
    'model_provider',
    'selected_model_id',
    'interaction_mode',
    'speech_mode_enabled',
    'wakeword_enabled',
    'wakeword_stt_enabled',
    'browser_automation_enabled',
    'include_query_screenshot',
    'provider_api_keys',
    'provider_oauth',
    'tools',
    'agent_definition',
  ]),
  'wakeword-detected': Object.freeze([]),
  'compact-history': Object.freeze([
    'force',
    'conversation_ref',
  ]),
  'tool-result': Object.freeze([
    'request_id',
    'success',
    'data',
    'error',
  ]),
  'tool-bundle-result': Object.freeze([
    'bundle_id',
    'status',
    'screenshot',
    'screenshot_ref',
    'capture_meta',
    'system_state',
    'step_results',
    'error',
  ]),
});

const PROVIDER_API_KEY_KEYS = Object.freeze([
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'mistral',
  'kimi_coding',
]);

const PROVIDER_API_KEY_ENTRY_KEYS = Object.freeze([
  'enabled',
  'api_key',
]);

const PROVIDER_OAUTH_KEYS = Object.freeze([
  'openai_codex',
]);

const PROVIDER_OAUTH_ENTRY_KEYS = Object.freeze([
  'connected',
  'access_token',
  'refresh_token',
  'expires_at',
  'profile_id',
]);

const TOOL_SETTINGS_KEYS = Object.freeze([
  'mode',
  'client_manifest',
]);

const CAPTURE_META_KEYS = Object.freeze([
  'source_w',
  'source_h',
  'crop_x',
  'crop_y',
  'crop_w',
  'crop_h',
  'desktop_virtual_bounds',
  'monitor_id',
  'timestamp',
  'capture_engine',
]);

const CAPTURE_BOUNDS_KEYS = Object.freeze([
  'x',
  'y',
  'width',
  'height',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function filterObjectKeys(source, allowedKeys) {
  if (!isPlainObject(source)) {
    return null;
  }
  const filtered = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      filtered[key] = source[key];
    }
  }
  return filtered;
}

function filterNestedObjectMap(source, allowedMapKeys, allowedEntryKeys) {
  if (!isPlainObject(source)) {
    return null;
  }
  const filtered = {};
  for (const key of allowedMapKeys) {
    const entry = filterObjectKeys(source[key], allowedEntryKeys);
    if (entry && Object.keys(entry).length > 0) {
      filtered[key] = entry;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : null;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeCaptureBounds(value) {
  const filtered = filterObjectKeys(value, CAPTURE_BOUNDS_KEYS);
  if (!filtered) {
    return null;
  }
  return CAPTURE_BOUNDS_KEYS.every((key) => isFiniteNumber(filtered[key]))
    ? filtered
    : null;
}

function normalizeCaptureMeta(value) {
  const filtered = filterObjectKeys(value, CAPTURE_META_KEYS);
  if (!filtered) {
    return null;
  }
  const requiredNumberKeys = [
    'source_w',
    'source_h',
    'crop_x',
    'crop_y',
    'crop_w',
    'crop_h',
    'timestamp',
  ];
  if (!requiredNumberKeys.every((key) => isFiniteNumber(filtered[key]))) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(filtered, 'desktop_virtual_bounds')) {
    const bounds = normalizeCaptureBounds(filtered.desktop_virtual_bounds);
    if (bounds) {
      filtered.desktop_virtual_bounds = bounds;
    } else {
      delete filtered.desktop_virtual_bounds;
    }
  }
  return filtered;
}

function normalizeUpdateSettingsPayload(payload) {
  const nextPayload = { ...payload };
  const tools = filterObjectKeys(nextPayload.tools, TOOL_SETTINGS_KEYS);
  if (tools) {
    nextPayload.tools = tools;
  } else {
    delete nextPayload.tools;
  }
  const providerApiKeys = filterNestedObjectMap(
    nextPayload.provider_api_keys,
    PROVIDER_API_KEY_KEYS,
    PROVIDER_API_KEY_ENTRY_KEYS,
  );
  if (providerApiKeys) {
    nextPayload.provider_api_keys = providerApiKeys;
  } else {
    delete nextPayload.provider_api_keys;
  }

  const providerOAuth = filterNestedObjectMap(
    nextPayload.provider_oauth,
    PROVIDER_OAUTH_KEYS,
    PROVIDER_OAUTH_ENTRY_KEYS,
  );
  if (providerOAuth) {
    nextPayload.provider_oauth = providerOAuth;
  } else {
    delete nextPayload.provider_oauth;
  }

  return nextPayload;
}

function normalizeToolResultPayload(payload) {
  const nextPayload = { ...payload };
  if (isPlainObject(nextPayload.data) && Object.prototype.hasOwnProperty.call(nextPayload.data, 'capture_meta')) {
    const captureMeta = normalizeCaptureMeta(nextPayload.data.capture_meta);
    nextPayload.data = { ...nextPayload.data };
    if (captureMeta) {
      nextPayload.data.capture_meta = captureMeta;
    } else {
      delete nextPayload.data.capture_meta;
    }
  }
  return nextPayload;
}

function normalizeToolBundleResultPayload(payload) {
  const nextPayload = { ...payload };
  if (Object.prototype.hasOwnProperty.call(nextPayload, 'capture_meta')) {
    const captureMeta = normalizeCaptureMeta(nextPayload.capture_meta);
    if (captureMeta) {
      nextPayload.capture_meta = captureMeta;
    } else {
      delete nextPayload.capture_meta;
    }
  }
  return nextPayload;
}

function normalizeKnownBackendPayload(type, payload) {
  if (type === 'update-settings') {
    return normalizeUpdateSettingsPayload(payload);
  }
  if (type === 'tool-result') {
    return normalizeToolResultPayload(payload);
  }
  if (type === 'tool-bundle-result') {
    return normalizeToolBundleResultPayload(payload);
  }
  return payload;
}

function filterBackendPayload(type, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  const allowedKeys = BACKEND_PAYLOAD_KEYS_BY_TYPE[type];
  if (!allowedKeys) {
    return { ...payload };
  }
  const filtered = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
      filtered[key] = payload[key];
    }
  }
  return normalizeKnownBackendPayload(type, filtered);
}

module.exports = {
  filterBackendPayload,
};
