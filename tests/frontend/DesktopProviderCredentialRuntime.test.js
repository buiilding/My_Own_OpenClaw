/**
 * Covers desktop provider credential runtime behavior in the frontend test suite.
 */

import {
  getProviderApiKeySpecs,
  normalizeProviderApiKeys,
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
      getProviderApiKeySpecs().map((provider) => provider.id).sort(),
    );
    expect(normalized.openai).toEqual({ enabled: true, api_key: 'sk-openai' });
    expect(normalized.anthropic).toEqual({ enabled: false, api_key: '' });
    expect(normalized.unknown).toBeUndefined();
  });

  test('exposes skin-configured provider API key control specs through a semantic helper', () => {
    expect(getProviderApiKeySpecs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'openai',
          title: 'OpenAI API Key',
          placeholder: 'Enter your OpenAI API Key',
        }),
      ]),
    );
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
