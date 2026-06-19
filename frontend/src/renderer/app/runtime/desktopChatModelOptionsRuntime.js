/**
 * Provides renderer chat model/provider option projection for presentation surfaces.
 */

import { formatProviderDisplayLabel } from '../skin/desktopRuntimeConfig';
import { getCurrentModels } from './desktopModelSelectionRuntime';

const REASONING_MODE_ORDER = ['none', 'low', 'medium', 'high', 'xhigh'];
const REASONING_MODE_LABELS = Object.freeze({
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
});

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProvider(provider) {
  return provider === undefined || provider === null
    ? ''
    : String(provider).trim().toLowerCase();
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
    .replace(/\s+/g, ' ')
    .trim();
  return cleanedLabel || rawLabel;
}

function normalizeReasoningMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return '';
  }
  if (normalized.includes('extra high') || normalized.includes('extra-high') || normalized.includes('xhigh')) {
    return 'xhigh';
  }
  if (/\bhigh\b/.test(normalized)) {
    return 'high';
  }
  if (/\bnone\b/.test(normalized)) {
    return 'none';
  }
  if (/\blow\b/.test(normalized) || normalized.includes('minimal')) {
    return 'low';
  }
  if (/\bmedium\b/.test(normalized)) {
    return 'medium';
  }
  return normalized;
}

function resolveVariantReasoningMode(variant) {
  const explicitReasoningMode = normalizeReasoningMode(variant?.reasoningMode);
  if (explicitReasoningMode) {
    return explicitReasoningMode;
  }
  if (variant?.supportsThinking !== true) {
    return 'none';
  }
  return '';
}

function getReasoningSortIndex(mode) {
  const index = REASONING_MODE_ORDER.indexOf(mode);
  return index >= 0 ? index : REASONING_MODE_ORDER.length;
}

function buildReasoningModeOptionsFromVariants(
  variants,
  explicitReasoningModes,
  defaultModelId,
) {
  const modeMap = new Map();
  const normalizedDefaultModelId = normalizeString(defaultModelId);

  variants.forEach((variant) => {
    const mode = resolveVariantReasoningMode(variant);
    if (!mode) {
      return;
    }
    if (!modeMap.has(mode)) {
      modeMap.set(mode, {
        mode,
        label: REASONING_MODE_LABELS[mode] || mode,
        modelId: variant.id,
      });
    }
  });

  const explicitOrderedModes = Array.isArray(explicitReasoningModes)
    ? explicitReasoningModes.map((mode) => normalizeReasoningMode(mode)).filter(Boolean)
    : [];
  const orderedModes = explicitOrderedModes.length > 0
    ? explicitOrderedModes
    : [...modeMap.keys()].sort(
      (left, right) => getReasoningSortIndex(left) - getReasoningSortIndex(right),
    );

  const options = orderedModes
    .map((mode) => modeMap.get(mode))
    .filter(Boolean);

  if (options.length === 0 && normalizedDefaultModelId) {
    return [{
      mode: 'none',
      label: REASONING_MODE_LABELS.none,
      modelId: normalizedDefaultModelId,
    }];
  }

  return options;
}

function findVariantByModelId(variants, modelId) {
  const normalizedModelId = normalizeString(modelId);
  if (!normalizedModelId) {
    return null;
  }
  return variants.find((variant) => variant.id === normalizedModelId) || null;
}

function deriveModelLabelFromVariants(variants, fallbackModelId, familyLabel, defaultVariant) {
  const explicitFamilyLabel = normalizeString(familyLabel);
  if (explicitFamilyLabel) {
    return explicitFamilyLabel;
  }
  const preferredVariant = defaultVariant || variants[0];
  const rawLabel = normalizeString(preferredVariant?.displayName) || normalizeString(fallbackModelId);
  return sanitizeModelDisplayLabel(rawLabel) || rawLabel || normalizeString(fallbackModelId);
}

function buildModelGroupKey(provider, runtimeModelId, familyId) {
  return normalizeString(familyId) || `${normalizeProvider(provider)}::${runtimeModelId}`;
}

export function formatProviderLabel(providerValue) {
  return formatProviderDisplayLabel(providerValue);
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
    const familyId = normalizeString(model?.family_id);
    const familyLabel = normalizeString(model?.family_label);
    const defaultModelId = normalizeString(model?.default_model_id);
    const defaultReasoningMode = normalizeReasoningMode(model?.default_reasoning_mode);
    const reasoningModes = Array.isArray(model?.reasoning_modes) ? model.reasoning_modes : [];
    const groupKey = buildModelGroupKey(provider, runtimeModelId, familyId);
    const group = groups.get(groupKey) || {
      familyId,
      familyLabel,
      provider,
      runtimeModelId,
      defaultModelId,
      defaultReasoningMode,
      reasoningModes,
      variants: [],
    };
    group.variants.push({
      id: modelId,
      runtimeModelId,
      provider,
      displayName: normalizeDisplayName(model, modelId),
      supportsThinking: model?.supports_thinking === true,
      reasoningMode: normalizeString(model?.reasoning_mode),
    });
    if (!group.familyId && familyId) {
      group.familyId = familyId;
    }
    if (!group.familyLabel && familyLabel) {
      group.familyLabel = familyLabel;
    }
    if (!group.defaultModelId && defaultModelId) {
      group.defaultModelId = defaultModelId;
    }
    if (!group.defaultReasoningMode && defaultReasoningMode) {
      group.defaultReasoningMode = defaultReasoningMode;
    }
    if (group.reasoningModes.length === 0 && reasoningModes.length > 0) {
      group.reasoningModes = reasoningModes;
    }
    groups.set(groupKey, group);
  });

  for (const group of groups.values()) {
    const reasoningModeOptions = buildReasoningModeOptionsFromVariants(
      group.variants,
      group.reasoningModes,
      group.defaultModelId,
    );
    const selectedVariant = group.variants.find((variant) => variant.id === configuredModelId);
    const selectedRuntimeVariant = group.variants.find(
      (variant) => variant.runtimeModelId === configuredModelId,
    );
    const explicitDefaultVariant = findVariantByModelId(group.variants, group.defaultModelId);
    const defaultReasoningVariant = reasoningModeOptions.find(
      (option) => option.mode === group.defaultReasoningMode,
    );
    const noneReasoningVariant = reasoningModeOptions.find(
      (option) => option.mode === 'none',
    );
    const mediumReasoningVariant = reasoningModeOptions.find((option) => option.mode === 'medium');
    const nonThinkingVariant = group.variants.find((variant) => variant.supportsThinking !== true);
    const defaultVariant = selectedVariant
      || selectedRuntimeVariant
      || explicitDefaultVariant
      || (defaultReasoningVariant
        ? findVariantByModelId(group.variants, defaultReasoningVariant.modelId)
        : null)
      || (noneReasoningVariant
        ? findVariantByModelId(group.variants, noneReasoningVariant.modelId)
        : null)
      || (mediumReasoningVariant
        ? findVariantByModelId(group.variants, mediumReasoningVariant.modelId)
        : null)
      || nonThinkingVariant
      || group.variants[0];

    const fallbackModelId = defaultVariant?.id || group.runtimeModelId || '';
    const label = deriveModelLabelFromVariants(
      group.variants,
      fallbackModelId,
      group.familyLabel,
      defaultVariant,
    );
    const supportsThinking = group.variants.some((variant) => variant.supportsThinking === true);
    options.push({
      id: fallbackModelId,
      familyId: group.familyId || buildModelGroupKey(group.provider, group.runtimeModelId),
      runtimeModelId: group.runtimeModelId,
      provider: group.provider,
      label,
      supportsThinking,
      defaultModelId: group.defaultModelId || fallbackModelId,
      defaultReasoningMode: group.defaultReasoningMode || (reasoningModeOptions[0]?.mode || null),
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
    }
  } else if (configuredModelId && options.length === 0) {
    options.unshift({
      id: configuredModelId,
      runtimeModelId: '',
      provider: normalizeString(configuredProvider),
      label: configuredModelId,
      supportsThinking: false,
      defaultModelId: configuredModelId,
      defaultReasoningMode: null,
      reasoningModeOptions: [],
    });
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
  const defaultReasoningMode = normalizeReasoningMode(modelOption?.defaultReasoningMode);
  if (defaultReasoningMode && reasoningModes.some((option) => option.mode === defaultReasoningMode)) {
    return defaultReasoningMode;
  }
  const none = reasoningModes.find((option) => option.mode === 'none');
  if (none) {
    return none.mode;
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
  const defaultModelId = normalizeString(modelOption?.defaultModelId);
  if (defaultModelId) {
    return defaultModelId;
  }
  const none = reasoningModes.find((option) => option.mode === 'none');
  if (none) {
    return none.modelId;
  }
  const medium = reasoningModes.find((option) => option.mode === 'medium');
  return (medium || reasoningModes[0]).modelId;
}
