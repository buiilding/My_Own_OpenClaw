/**
 * Defines app config persistence configuration for the renderer UI.
 */

import { hasShallowConfigChanges } from './configComparison';
import { filterFrontendConfig } from '../../utils/configFilter';

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

export function sanitizeRendererProviderConfig(config) {
  if (!isPlainObject(config)) {
    return {};
  }

  const sanitized = sanitizeObjectValues(filterFrontendConfig(config));
  if (isPlainObject(sanitized.provider_api_keys)) {
    const providerApiKeys = {};
    for (const [provider, entry] of Object.entries(sanitized.provider_api_keys)) {
      providerApiKeys[provider] = isPlainObject(entry)
        ? sanitizeObjectValues(entry)
        : entry;
    }
    sanitized.provider_api_keys = providerApiKeys;
  }
  return sanitized;
}

export function buildRendererConfigPersistencePayload(config) {
  const sanitized = sanitizeRendererProviderConfig(config);
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
  return sanitized;
}

export function mergeRendererProviderConfig(baseConfig, patchConfig) {
  const mergedConfig = {
    ...sanitizeRendererProviderConfig(baseConfig),
    ...sanitizeRendererProviderConfig(patchConfig),
  };

  const mergedProviderApiKeys = mergeProviderApiKeys(baseConfig, patchConfig);
  if (mergedProviderApiKeys !== undefined) {
    mergedConfig.provider_api_keys = mergedProviderApiKeys;
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
