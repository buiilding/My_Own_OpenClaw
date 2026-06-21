/**
 * Owns renderer provider credential projection and persistence normalization.
 */

import {
  DEFAULT_PROVIDER_API_KEYS,
  PROVIDER_API_KEY_SPECS,
} from '../skin/desktopRuntimeConfig';

export { PROVIDER_API_KEY_SPECS };

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeProviderApiKeys(input = null) {
  const source = isPlainRecord(input) ? input : {};
  const normalized = {};

  for (const [provider, defaults] of Object.entries(DEFAULT_PROVIDER_API_KEYS)) {
    const candidate = isPlainRecord(source[provider]) ? source[provider] : {};
    normalized[provider] = {
      enabled: candidate.enabled === true,
      api_key: typeof candidate.api_key === 'string' ? candidate.api_key : defaults.api_key,
    };
  }

  return normalized;
}

export function stripProviderApiKeySecrets(input = null) {
  const normalized = normalizeProviderApiKeys(input);
  const stripped = {};

  for (const [provider, entry] of Object.entries(normalized)) {
    stripped[provider] = {
      ...entry,
      api_key: '',
    };
  }

  return stripped;
}
