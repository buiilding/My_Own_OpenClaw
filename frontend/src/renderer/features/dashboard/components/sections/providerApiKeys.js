/**
 * Provides the provider api keys module for the renderer UI.
 */

import {
  DEFAULT_PROVIDER_API_KEYS,
  PROVIDER_API_KEY_SPECS,
} from '../../../../app/skin/providerCredentialSettings';

export { PROVIDER_API_KEY_SPECS };

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeProviderApiKeys(input) {
  const source = isPlainObject(input) ? input : {};
  const normalized = {};

  for (const [provider, defaults] of Object.entries(DEFAULT_PROVIDER_API_KEYS)) {
    const candidate = isPlainObject(source[provider]) ? source[provider] : {};
    normalized[provider] = {
      enabled: candidate.enabled === true,
      api_key: typeof candidate.api_key === 'string' ? candidate.api_key : defaults.api_key,
    };
  }

  return normalized;
}
