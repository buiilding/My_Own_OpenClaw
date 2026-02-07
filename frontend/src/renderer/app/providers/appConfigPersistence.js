import { hasShallowConfigChanges } from './configComparison';

export function sanitizeFrontendProviderConfig(nextConfig) {
  return {
    ...nextConfig,
    voice_mode_enabled: false,
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
