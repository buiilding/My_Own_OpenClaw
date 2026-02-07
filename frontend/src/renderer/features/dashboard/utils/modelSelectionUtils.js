const EMPTY_MODEL_SELECTION = { id: '', provider: '' };

export function getCurrentModels(availableModels, modelMode) {
  const localModels = Array.isArray(availableModels?.local) ? availableModels.local : [];
  const onlineModels = Array.isArray(availableModels?.online) ? availableModels.online : [];
  return modelMode === 'local' ? localModels : onlineModels;
}

export function filterModelsBySearch(models, searchTerm) {
  const query = searchTerm.trim().toLowerCase();
  if (!query) {
    return models;
  }
  return models.filter((model) => {
    const id = model?.id || '';
    const provider = model?.provider || '';
    return id.toLowerCase().includes(query) || provider.toLowerCase().includes(query);
  });
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
  const normalizedSelectedProvider = selectedProvider === undefined || selectedProvider === null
    ? ''
    : String(selectedProvider);

  const matchedModel = currentModels.find((model) => String(model?.id ?? '') === normalizedSelectedModelId);
  if (!matchedModel) {
    return {
      status: 'missing',
      warning: `Selected model "${normalizedSelectedModelId}" is not available. Resetting to default.`,
    };
  }

  const matchedProvider = matchedModel.provider === undefined || matchedModel.provider === null
    ? ''
    : String(matchedModel.provider);
  if (matchedProvider !== normalizedSelectedProvider) {
    return { status: 'provider-mismatch', model: matchedModel };
  }

  return { status: 'valid', model: matchedModel };
}

export function getFallbackModelSelection(currentModels) {
  return currentModels[0] || EMPTY_MODEL_SELECTION;
}
