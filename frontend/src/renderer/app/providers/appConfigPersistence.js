import { hasShallowConfigChanges } from './configComparison';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function sanitizeFrontendProviderConfig(config) {
  if (!isPlainObject(config)) {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function mergeFrontendProviderConfig(baseConfig, patchConfig) {
  return {
    ...sanitizeFrontendProviderConfig(baseConfig),
    ...sanitizeFrontendProviderConfig(patchConfig),
  };
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
