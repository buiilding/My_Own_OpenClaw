/**
 * Provides the model selection utils module for the renderer UI.
 */

const EMPTY_MODEL_SELECTION = { id: '', provider: '' };

function normalizeProvider(provider) {
  return provider === undefined || provider === null ? '' : String(provider);
}

function compareProvidersAscending(left, right) {
  const leftProvider = normalizeProvider(left?.provider);
  const rightProvider = normalizeProvider(right?.provider);
  return leftProvider.localeCompare(rightProvider);
}

export function getCurrentModels(availableModels, modelMode) {
  const localModels = Array.isArray(availableModels?.local) ? availableModels.local : [];
  const onlineModels = Array.isArray(availableModels?.online) ? availableModels.online : [];
  return modelMode === 'local' ? localModels : onlineModels;
}

export function buildModelConfigUpdate(params) {
  const {
    modelMode,
    interactionMode,
    speechModeEnabled,
    selectedModel,
  } = params;
  const normalizedSelection = selectedModel || EMPTY_MODEL_SELECTION;
  const selectedModelId = normalizedSelection.id === undefined || normalizedSelection.id === null
    ? ''
    : String(normalizedSelection.id);
  const selectedProvider = normalizedSelection.provider === undefined || normalizedSelection.provider === null
    ? ''
    : String(normalizedSelection.provider);

  return {
    model_mode: modelMode,
    selected_model_id: selectedModelId,
    model_provider: selectedProvider,
    speech_mode_enabled: speechModeEnabled,
    interaction_mode: interactionMode,
  };
}

export function evaluateModelSelection({ selectedModelId, selectedProvider, currentModels }) {
  if (selectedModelId === undefined || selectedModelId === null || selectedModelId === '') {
    return { status: 'empty' };
  }
  const normalizedSelectedModelId = String(selectedModelId);
  const normalizedSelectedProvider = normalizeProvider(selectedProvider);

  const candidateModels = currentModels
    .filter((model) => String(model?.id ?? '') === normalizedSelectedModelId)
    .slice()
    .sort(compareProvidersAscending);

  if (candidateModels.length === 0) {
    return {
      status: 'missing',
      warning: `Selected model "${normalizedSelectedModelId}" is not available. Resetting to default.`,
    };
  }

  if (normalizedSelectedProvider.length > 0) {
    const exactModel = candidateModels.find(
      (model) => normalizeProvider(model?.provider) === normalizedSelectedProvider,
    );
    if (exactModel) {
      return { status: 'valid', model: exactModel };
    }
  }

  const canonicalModel = candidateModels[0];
  const canonicalProvider = normalizeProvider(canonicalModel?.provider);
  if (canonicalProvider !== normalizedSelectedProvider) {
    return { status: 'provider-mismatch', model: canonicalModel };
  }

  return { status: 'valid', model: canonicalModel };
}

export function getFallbackModelSelection(currentModels) {
  return currentModels[0] || EMPTY_MODEL_SELECTION;
}
