/**
 * Covers desktop provider credential runtime behavior in the frontend test suite.
 */

import {
  normalizeProviderApiKeys,
  PROVIDER_API_KEY_SPECS,
  stripProviderApiKeySecrets,
} from '../../frontend/src/renderer/app/runtime/desktopProviderCredentialRuntime.js';

describe('desktopProviderCredentialRuntime', () => {
  test('normalizes provider API keys through the skin-configured provider set', () => {
    const normalized = normalizeProviderApiKeys({
      openai: { enabled: true, api_key: 'sk-openai' },
      anthropic: { enabled: 'yes', api_key: 42 },
      unknown: { enabled: true, api_key: 'sk-unknown' },
    });

    expect(Object.keys(normalized).sort()).toEqual(
      PROVIDER_API_KEY_SPECS.map((provider) => provider.id).sort(),
    );
    expect(normalized.openai).toEqual({ enabled: true, api_key: 'sk-openai' });
    expect(normalized.anthropic).toEqual({ enabled: false, api_key: '' });
    expect(normalized.unknown).toBeUndefined();
  });

  test('strips provider API key secrets after normalization', () => {
    expect(stripProviderApiKeySecrets({
      openai: { enabled: true, api_key: 'sk-openai' },
      google: { enabled: true, api_key: 'google-secret' },
    })).toEqual({
      openai: { enabled: true, api_key: '' },
      anthropic: { enabled: false, api_key: '' },
      google: { enabled: true, api_key: '' },
      openrouter: { enabled: false, api_key: '' },
      mistral: { enabled: false, api_key: '' },
      kimi_coding: { enabled: false, api_key: '' },
    });
  });
});
