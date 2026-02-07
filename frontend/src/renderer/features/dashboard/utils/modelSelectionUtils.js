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

  return {
    model_mode: modelMode,
    selected_model_id: normalizedSelection.id || '',
    model_provider: normalizedSelection.provider || '',
    speech_mode_enabled: speechModeEnabled,
    interaction_mode: interactionMode,
  };
}

export function evaluateModelSelection({ selectedModelId, selectedProvider, currentModels }) {
  if (!selectedModelId) {
    return { status: 'empty' };
  }

  const matchedModel = currentModels.find((model) => model.id === selectedModelId);
  if (!matchedModel) {
    return {
      status: 'missing',
      warning: `Selected model "${selectedModelId}" is not available. Resetting to default.`,
    };
  }

  if (matchedModel.provider !== selectedProvider) {
    return { status: 'provider-mismatch', model: matchedModel };
  }

  return { status: 'valid', model: matchedModel };
}

export function getFallbackModelSelection(currentModels) {
  return currentModels[0] || EMPTY_MODEL_SELECTION;
}
