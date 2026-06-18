/**
 * WindieOS provider credential display/config defaults for the renderer skin.
 */

export const DEFAULT_PROVIDER_API_KEYS = Object.freeze({
  openai: Object.freeze({ enabled: false, api_key: '' }),
  anthropic: Object.freeze({ enabled: false, api_key: '' }),
  google: Object.freeze({ enabled: false, api_key: '' }),
  openrouter: Object.freeze({ enabled: false, api_key: '' }),
  mistral: Object.freeze({ enabled: false, api_key: '' }),
  kimi_coding: Object.freeze({ enabled: false, api_key: '' }),
});

export const PROVIDER_API_KEY_SPECS = Object.freeze([
  Object.freeze({
    id: 'openai',
    title: 'OpenAI API Key',
    description: 'Enable to use your own OpenAI key.',
    placeholder: 'Enter your OpenAI API Key',
  }),
  Object.freeze({
    id: 'anthropic',
    title: 'Anthropic API Key',
    description: 'Enable to use your own Anthropic key.',
    placeholder: 'Enter your Anthropic API Key',
  }),
  Object.freeze({
    id: 'kimi_coding',
    title: 'Kimi Coding API Key',
    description: 'Enable to use your own Kimi Coding key.',
    placeholder: 'Enter your Kimi Coding API Key',
  }),
  Object.freeze({
    id: 'google',
    title: 'Google API Key',
    description: 'Enable to use your own Google AI Studio key.',
    placeholder: 'Enter your Google API Key',
  }),
  Object.freeze({
    id: 'openrouter',
    title: 'OpenRouter API Key',
    description: 'Enable to use your own OpenRouter key.',
    placeholder: 'Enter your OpenRouter API Key',
  }),
  Object.freeze({
    id: 'mistral',
    title: 'Mistral API Key',
    description: 'Enable to use your own Mistral key.',
    placeholder: 'Enter your Mistral API Key',
  }),
]);
