/**
 * WindieOS provider model display fallbacks for the renderer skin.
 */

const DEFAULT_PROVIDER_MODEL_DISPLAY = Object.freeze({
  description: 'General-purpose model suitable for chat, coding and reasoning tasks.',
  strengths: Object.freeze(['Reasoning', 'General', 'Productivity', 'Flexible']),
});

const PROVIDER_MODEL_DISPLAY_FALLBACKS = Object.freeze([
  Object.freeze({
    patterns: Object.freeze(['openai']),
    description: 'OpenAI flagship model family for chat, coding, and agent workflows.',
    strengths: Object.freeze(['Reasoning', 'Code', 'Vision', 'Multilingual']),
  }),
  Object.freeze({
    patterns: Object.freeze(['anthropic']),
    description: 'Advanced reasoning with strong instruction following.',
    strengths: Object.freeze(['Analysis', 'Writing', 'Safety', 'Long Context']),
  }),
  Object.freeze({
    patterns: Object.freeze(['google', 'gemini']),
    description: 'Powerful model family with native multimodal understanding.',
    strengths: Object.freeze(['Multimodal', 'Search', 'Code', 'Efficiency']),
  }),
  Object.freeze({
    patterns: Object.freeze(['mistral']),
    description: 'General-purpose model tuned for coding, reasoning, and multilingual tasks.',
    strengths: Object.freeze(['Code', 'Reasoning', 'Fast', 'Multilingual']),
  }),
  Object.freeze({
    patterns: Object.freeze(['openrouter']),
    description: 'Unified router for accessing multiple upstream models through one endpoint.',
    strengths: Object.freeze(['Routing', 'Breadth', 'Flexible', 'Context']),
  }),
  Object.freeze({
    patterns: Object.freeze(['kimi']),
    description: 'Agentic coding model from Moonshot with strong long-context and multimodal support.',
    strengths: Object.freeze(['Agentic', 'Code', 'Multimodal', 'Long Context']),
  }),
  Object.freeze({
    patterns: Object.freeze(['scripted']),
    description: 'Dev-only deterministic runtime for validating streaming, images, and tool calls.',
    strengths: Object.freeze(['Deterministic', 'Tools', 'Streaming', 'Images']),
  }),
  Object.freeze({
    patterns: Object.freeze(['ollama', 'local']),
    description: 'Local model runtime for private on-device workflows.',
    strengths: Object.freeze(['Private', 'Offline', 'Low Latency', 'Customization']),
  }),
]);

const PROVIDER_LABEL_OVERRIDES = Object.freeze({
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  scripted: 'Scripted',
});

export function formatProviderDisplayLabel(providerValue) {
  const provider = String(providerValue || '').trim();
  if (!provider) {
    return provider;
  }
  const lowerProvider = provider.toLowerCase();
  const override = PROVIDER_LABEL_OVERRIDES[lowerProvider];
  if (override) {
    return override;
  }
  return provider
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('-');
}

export function resolveProviderModelDisplay(provider) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const fallback = PROVIDER_MODEL_DISPLAY_FALLBACKS.find((entry) => (
    entry.patterns.some((pattern) => normalizedProvider.includes(pattern))
  ));
  return fallback || DEFAULT_PROVIDER_MODEL_DISPLAY;
}
