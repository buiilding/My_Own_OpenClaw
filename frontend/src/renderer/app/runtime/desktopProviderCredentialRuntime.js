/**
 * Owns renderer provider credential projection and persistence normalization.
 */

import { DesktopRuntimeConfig } from '../skin/desktopRuntimeConfig';

const {
  DEFAULT_PROVIDER_API_KEYS,
  PROVIDER_API_KEY_SPECS,
} = DesktopRuntimeConfig;

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getProviderApiKeySpecs() {
  return PROVIDER_API_KEY_SPECS;
}

function normalizeProviderApiKeys(input = null) {
  const source = isPlainRecord(input) ? input : {};
  const normalized = {};

  for (const [provider, defaults] of Object.entries(DEFAULT_PROVIDER_API_KEYS)) {
    const candidate = isPlainRecord(source[provider]) ? source[provider] : {};
    const apiKey = typeof candidate.api_key === 'string' ? candidate.api_key : defaults.api_key;
    const enabled = candidate.enabled === true;
    normalized[provider] = {
      enabled,
      api_key: apiKey,
      has_saved_key: enabled && (
        candidate.has_saved_key === true
        || apiKey.length > 0
      ),
    };
    if (candidate.clear_saved_key === true) {
      normalized[provider].clear_saved_key = true;
      normalized[provider].has_saved_key = false;
    }
  }

  return normalized;
}

function stripProviderApiKeySecrets(input = null) {
  const normalized = normalizeProviderApiKeys(input);
  const stripped = {};

  for (const [provider, entry] of Object.entries(normalized)) {
    stripped[provider] = {
      ...entry,
      api_key: '',
      has_saved_key: entry.enabled === true
        && entry.clear_saved_key !== true
        && (
          entry.has_saved_key === true
          || entry.api_key.length > 0
        ),
    };
    delete stripped[provider].clear_saved_key;
  }

  return stripped;
}

export const DesktopProviderCredentialRuntime = {
  getProviderApiKeySpecs,
  normalizeProviderApiKeys,
  stripProviderApiKeySecrets,
};
