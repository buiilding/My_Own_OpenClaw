import { normalizeProvider } from './session/transcriptMessagePayload';
import { getCurrentModels } from '../../dashboard/utils/modelSelectionUtils';

const REASONING_MODE_ORDER = ['low', 'medium', 'high', 'extra_high'];
const REASONING_MODE_LABELS = Object.freeze({
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  extra_high: 'Extra High',
});

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDisplayName(model, modelId) {
  return normalizeString(
    model?.display_name
    || model?.displayName
    || modelId,
  );
}

function sanitizeModelDisplayLabel(displayName) {
  const rawLabel = normalizeString(displayName);
  if (!rawLabel) {
    return rawLabel;
  }
  const cleanedLabel = rawLabel
    .replace(/\b(extra[\s-]*high|xhigh|high|medium|low|minimal|none)\b/ig, ' ')
    .replace(/\b(fast|spark)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleanedLabel || rawLabel;
}

function resolveReasoningModeFromText(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return 'medium';
  }
  if (normalized.includes('extra high') || normalized.includes('extra-high') || normalized.includes('xhigh')) {
    return 'extra_high';
  }
  if (/\bhigh\b/.test(normalized)) {
    return 'high';
  }
  if (/\blow\b/.test(normalized) || normalized.includes('minimal') || /\bnone\b/.test(normalized)) {
    return 'low';
  }
  if (/\bmedium\b/.test(normalized)) {
    return 'medium';
  }
  return 'medium';
}

function resolveVariantReasoningMode(variant) {
  const displayName = normalizeString(variant?.displayName);
  const modelId = normalizeString(variant?.id);
  return resolveReasoningModeFromText(displayName || modelId);
}

function getReasoningSortIndex(mode) {
  const index = REASONING_MODE_ORDER.indexOf(mode);
  return index >= 0 ? index : REASONING_MODE_ORDER.length;
}

function buildReasoningModeOptionsFromVariants(variants, configuredModelId) {
  const modeMap = new Map();
  const configuredId = normalizeString(configuredModelId);

  variants.forEach((variant) => {
    if (variant.supportsThinking !== true) {
      return;
    }
    const mode = resolveVariantReasoningMode(variant);
    const existing = modeMap.get(mode);
    const isConfiguredVariant = configuredId && variant.id === configuredId;
    if (!existing || isConfiguredVariant) {
      modeMap.set(mode, {
        mode,
        label: REASONING_MODE_LABELS[mode] || mode,
        modelId: variant.id,
      });
    }
  });

  return [...modeMap.values()].sort(
    (left, right) => getReasoningSortIndex(left.mode) - getReasoningSortIndex(right.mode),
  );
}

function deriveModelLabelFromVariants(variants, fallbackModelId) {
  const preferredVariant = variants.find((variant) => variant.supportsThinking !== true)
    || variants.find((variant) => resolveVariantReasoningMode(variant) === 'medium')
    || variants[0];
  const rawLabel = normalizeString(preferredVariant?.displayName) || normalizeString(fallbackModelId);
  return sanitizeModelDisplayLabel(rawLabel) || rawLabel || normalizeString(fallbackModelId);
}

function buildModelGroupKey(provider, runtimeModelId) {
  return `${normalizeProvider(provider)}::${runtimeModelId}`;
}

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
  const groups = new Map();
  const options = [];

  availableModelPool.forEach((model) => {
    const modelId = normalizeString(model?.id);
    if (!modelId) {
      return;
    }
    const provider = normalizeString(model?.provider || configuredProvider);
    if (
      normalizedSelectedProvider
      && normalizeProvider(provider) !== normalizedSelectedProvider
    ) {
      return;
    }
    const runtimeModelId = normalizeString(model?.runtime_model_id || modelId);
    const groupKey = buildModelGroupKey(provider, runtimeModelId);
    const group = groups.get(groupKey) || {
      provider,
      runtimeModelId,
      variants: [],
    };
    group.variants.push({
      id: modelId,
      runtimeModelId,
      provider,
      displayName: normalizeDisplayName(model, modelId),
      supportsThinking: model?.supports_thinking === true,
    });
    groups.set(groupKey, group);
  });

  for (const group of groups.values()) {
    const reasoningModeOptions = buildReasoningModeOptionsFromVariants(group.variants, configuredModelId);
    const selectedVariant = group.variants.find((variant) => variant.id === configuredModelId);
    const selectedRuntimeVariant = group.variants.find(
      (variant) => variant.runtimeModelId === configuredModelId,
    );
    const mediumReasoningVariant = reasoningModeOptions.find((option) => option.mode === 'medium');
    const nonThinkingVariant = group.variants.find((variant) => variant.supportsThinking !== true);
    const defaultVariant = selectedVariant
      || selectedRuntimeVariant
      || (mediumReasoningVariant
        ? group.variants.find((variant) => variant.id === mediumReasoningVariant.modelId)
        : null)
      || nonThinkingVariant
      || group.variants[0];

    const fallbackModelId = defaultVariant?.id || group.runtimeModelId || '';
    const label = deriveModelLabelFromVariants(group.variants, fallbackModelId);
    const supportsThinking = group.variants.some((variant) => variant.supportsThinking === true);
    options.push({
      id: fallbackModelId,
      runtimeModelId: group.runtimeModelId,
      provider: group.provider,
      label,
      supportsThinking,
      reasoningModeOptions,
    });
  }

  if (configuredModelId && options.length > 0) {
    const selectedIndex = options.findIndex((option) => (
      option.id === configuredModelId || option.runtimeModelId === configuredModelId
    ));
    if (selectedIndex > 0) {
      const [selectedOption] = options.splice(selectedIndex, 1);
      options.unshift(selectedOption);
    } else if (selectedIndex < 0) {
      options.unshift({
        id: configuredModelId,
        runtimeModelId: '',
        provider: normalizeString(configuredProvider),
        label: configuredModelId,
        supportsThinking: false,
        reasoningModeOptions: [],
      });
    }
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

export function resolveSelectedReasoningMode(modelOption, configuredModelId) {
  const reasoningModes = Array.isArray(modelOption?.reasoningModeOptions)
    ? modelOption.reasoningModeOptions
    : [];
  if (reasoningModes.length === 0) {
    return null;
  }
  const exact = reasoningModes.find((option) => option.modelId === configuredModelId);
  if (exact) {
    return exact.mode;
  }
  const medium = reasoningModes.find((option) => option.mode === 'medium');
  return (medium || reasoningModes[0]).mode;
}

export function resolveModelIdForReasoningMode(modelOption, mode) {
  const reasoningModes = Array.isArray(modelOption?.reasoningModeOptions)
    ? modelOption.reasoningModeOptions
    : [];
  if (reasoningModes.length === 0) {
    return normalizeString(modelOption?.id);
  }
  const exact = reasoningModes.find((option) => option.mode === mode);
  if (exact) {
    return exact.modelId;
  }
  const medium = reasoningModes.find((option) => option.mode === 'medium');
  return (medium || reasoningModes[0]).modelId;
}
