import { normalizeProvider } from './session/transcriptMessagePayload';
import { getCurrentModels } from '../../dashboard/utils/modelSelectionUtils';

export function formatProviderLabel(providerValue) {
  const provider = String(providerValue || '').trim();
  if (!provider) {
    return provider;
  }
  const lowerProvider = provider.toLowerCase();
  if (lowerProvider === 'openai') {
    return 'OpenAI';
  }
  if (lowerProvider === 'openrouter') {
    return 'OpenRouter';
  }
  return provider
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('-');
}

export const getAvailableModelPool = getCurrentModels;

export function buildChatModelOptions({
  availableModelPool,
  configuredModelId,
  configuredProvider,
}) {
  const normalizedSelectedProvider = normalizeProvider(configuredProvider);
  const seenModelIds = new Set();
  const options = [];

  availableModelPool.forEach((model) => {
    const modelId = String(model?.id || '').trim();
    if (!modelId || seenModelIds.has(modelId)) {
      return;
    }
    if (
      normalizedSelectedProvider
      && normalizeProvider(model?.provider) !== normalizedSelectedProvider
    ) {
      return;
    }
    seenModelIds.add(modelId);
    options.push({
      id: modelId,
      runtimeModelId: String(model?.runtime_model_id || '').trim(),
      provider: String(model?.provider || configuredProvider || '').trim(),
      label: String(model?.display_name || model?.displayName || modelId),
      supportsThinking: model?.supports_thinking === true,
    });
  });

  const selectedRuntimeIndex = options.findIndex(
    (option) => option.runtimeModelId === configuredModelId,
  );
  if (configuredModelId && !seenModelIds.has(configuredModelId)) {
    if (selectedRuntimeIndex >= 0) {
      if (selectedRuntimeIndex > 0) {
        const [selectedOption] = options.splice(selectedRuntimeIndex, 1);
        options.unshift(selectedOption);
      }
      return options;
    }
    options.unshift({
      id: configuredModelId,
      runtimeModelId: '',
      provider: String(configuredProvider || '').trim(),
      label: configuredModelId,
      supportsThinking: false,
    });
    return options;
  }

  const selectedIndex = options.findIndex((option) => option.id === configuredModelId);
  if (selectedIndex > 0) {
    const [selectedOption] = options.splice(selectedIndex, 1);
    options.unshift(selectedOption);
  }

  return options;
}

export function buildChatProviderOptions({
  availableModelPool,
  configuredProvider,
}) {
  const seenProviders = new Set();
  const options = [];

  availableModelPool.forEach((model) => {
    const provider = String(model?.provider || '').trim();
    if (!provider || seenProviders.has(provider)) {
      return;
    }
    seenProviders.add(provider);
    options.push(provider);
  });

  options.sort((left, right) => left.localeCompare(right));

  if (
    configuredProvider
    && !options.some((provider) => normalizeProvider(provider) === normalizeProvider(configuredProvider))
  ) {
    options.unshift(configuredProvider);
  }

  return options;
}

export function resolveProviderModels(availableModelPool, provider) {
  const normalizedSelectedProvider = normalizeProvider(provider);
  return availableModelPool.filter(
    (model) => normalizeProvider(model?.provider) === normalizedSelectedProvider,
  );
}

export function resolveSelectedModelOption(modelOptions, configuredModelId) {
  return modelOptions.find(
    (option) => option.id === configuredModelId || option.runtimeModelId === configuredModelId,
  ) || modelOptions[0];
}
