import { hasShallowConfigChanges } from './configComparison';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeObjectValues(source) {
  if (!isPlainObject(source)) {
    return {};
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function mergeProviderApiKeys(baseConfig, patchConfig) {
  const baseKeys = isPlainObject(baseConfig?.provider_api_keys)
    ? baseConfig.provider_api_keys
    : {};
  const patchKeys = isPlainObject(patchConfig?.provider_api_keys)
    ? patchConfig.provider_api_keys
    : {};

  if (Object.keys(baseKeys).length === 0 && Object.keys(patchKeys).length === 0) {
    return undefined;
  }

  const merged = { ...baseKeys };
  for (const [provider, patchEntry] of Object.entries(patchKeys)) {
    if (!isPlainObject(patchEntry)) {
      if (patchEntry !== undefined) {
        merged[provider] = patchEntry;
      }
      continue;
    }
    const baseEntry = isPlainObject(baseKeys[provider]) ? baseKeys[provider] : {};
    merged[provider] = {
      ...sanitizeObjectValues(baseEntry),
      ...sanitizeObjectValues(patchEntry),
    };
  }

  return merged;
}

function mergeProviderOAuth(baseConfig, patchConfig) {
  const baseOauth = isPlainObject(baseConfig?.provider_oauth)
    ? baseConfig.provider_oauth
    : {};
  const patchOauth = isPlainObject(patchConfig?.provider_oauth)
    ? patchConfig.provider_oauth
    : {};

  if (Object.keys(baseOauth).length === 0 && Object.keys(patchOauth).length === 0) {
    return undefined;
  }

  const merged = { ...baseOauth };
  for (const [provider, patchEntry] of Object.entries(patchOauth)) {
    if (!isPlainObject(patchEntry)) {
      if (patchEntry !== undefined) {
        merged[provider] = patchEntry;
      }
      continue;
    }
    const baseEntry = isPlainObject(baseOauth[provider]) ? baseOauth[provider] : {};
    merged[provider] = {
      ...sanitizeObjectValues(baseEntry),
      ...sanitizeObjectValues(patchEntry),
    };
  }

  return merged;
}

export function sanitizeFrontendProviderConfig(config) {
  if (!isPlainObject(config)) {
    return {};
  }

  const sanitized = sanitizeObjectValues(config);
  if (isPlainObject(sanitized.provider_api_keys)) {
    const providerApiKeys = {};
    for (const [provider, entry] of Object.entries(sanitized.provider_api_keys)) {
      providerApiKeys[provider] = isPlainObject(entry)
        ? sanitizeObjectValues(entry)
        : entry;
    }
    sanitized.provider_api_keys = providerApiKeys;
  }
  if (isPlainObject(sanitized.provider_oauth)) {
    const providerOauth = {};
    for (const [provider, entry] of Object.entries(sanitized.provider_oauth)) {
      providerOauth[provider] = isPlainObject(entry)
        ? sanitizeObjectValues(entry)
        : entry;
    }
    sanitized.provider_oauth = providerOauth;
  }
  return sanitized;
}

export function buildFrontendConfigPersistencePayload(config) {
  const sanitized = sanitizeFrontendProviderConfig(config);
  if (isPlainObject(sanitized.provider_api_keys)) {
    const providerApiKeys = {};
    for (const [provider, entry] of Object.entries(sanitized.provider_api_keys)) {
      providerApiKeys[provider] = isPlainObject(entry)
        ? {
          ...entry,
          api_key: '',
        }
        : entry;
    }
    sanitized.provider_api_keys = providerApiKeys;
  }
  if (isPlainObject(sanitized.provider_oauth)) {
    const providerOauth = {};
    for (const [provider, entry] of Object.entries(sanitized.provider_oauth)) {
      providerOauth[provider] = isPlainObject(entry)
        ? {
          ...entry,
          access_token: '',
          refresh_token: '',
        }
        : entry;
    }
    sanitized.provider_oauth = providerOauth;
  }
  return sanitized;
}

export function mergeFrontendProviderConfig(baseConfig, patchConfig) {
  const mergedConfig = {
    ...sanitizeFrontendProviderConfig(baseConfig),
    ...sanitizeFrontendProviderConfig(patchConfig),
  };

  const mergedProviderApiKeys = mergeProviderApiKeys(baseConfig, patchConfig);
  if (mergedProviderApiKeys !== undefined) {
    mergedConfig.provider_api_keys = mergedProviderApiKeys;
  }
  const mergedProviderOauth = mergeProviderOAuth(baseConfig, patchConfig);
  if (mergedProviderOauth !== undefined) {
    mergedConfig.provider_oauth = mergedProviderOauth;
  }

  return mergedConfig;
}

export function applyConfigIfChanged(nextConfig, configRef, setConfig) {
  if (!nextConfig || Object.keys(nextConfig).length === 0) {
    return false;
  }

  if (!hasShallowConfigChanges(configRef.current, nextConfig)) {
    return false;
  }

  configRef.current = nextConfig;
  setConfig(nextConfig);
  return true;
}
