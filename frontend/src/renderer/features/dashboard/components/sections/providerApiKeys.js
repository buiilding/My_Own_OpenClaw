const DEFAULT_PROVIDER_API_KEYS = Object.freeze({
  openai: Object.freeze({ enabled: false, api_key: '' }),
  anthropic: Object.freeze({ enabled: false, api_key: '' }),
  kimi_coding: Object.freeze({ enabled: false, api_key: '' }),
  google: Object.freeze({ enabled: false, api_key: '' }),
  openrouter: Object.freeze({ enabled: false, api_key: '' }),
  mistral: Object.freeze({ enabled: false, api_key: '' }),
});

export const PROVIDER_API_KEY_SPECS = [
  {
    id: 'openai',
    title: 'OpenAI API Key',
    description: 'Enable to use your own OpenAI key.',
    placeholder: 'Enter your OpenAI API Key',
  },
  {
    id: 'anthropic',
    title: 'Anthropic API Key',
    description: 'Enable to use your own Anthropic key.',
    placeholder: 'Enter your Anthropic API Key',
  },
  {
    id: 'kimi_coding',
    title: 'Kimi Code API Key',
    description: 'Enable to use your own Kimi Code key.',
    placeholder: 'Enter your Kimi Code API Key',
  },
  {
    id: 'google',
    title: 'Google API Key',
    description: 'Enable to use your own Google AI Studio key.',
    placeholder: 'Enter your Google API Key',
  },
  {
    id: 'openrouter',
    title: 'OpenRouter API Key',
    description: 'Enable to use your own OpenRouter key.',
    placeholder: 'Enter your OpenRouter API Key',
  },
  {
    id: 'mistral',
    title: 'Mistral API Key',
    description: 'Enable to use your own Mistral key.',
    placeholder: 'Enter your Mistral API Key',
  },
];

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
