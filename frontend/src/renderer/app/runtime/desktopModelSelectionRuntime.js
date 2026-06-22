/**
 * Provides shared renderer model-selection reconciliation for chat and settings UI.
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

function getCurrentModels(availableModels, modelMode) {
  const localModels = Array.isArray(availableModels?.local) ? availableModels.local : [];
  const onlineModels = Array.isArray(availableModels?.online) ? availableModels.online : [];
  return modelMode === 'local' ? localModels : onlineModels;
}

function buildModelConfigUpdate(params) {
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

function evaluateModelSelection({ selectedModelId, selectedProvider, currentModels }) {
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

function getFallbackModelSelection(currentModels) {
  return currentModels[0] || EMPTY_MODEL_SELECTION;
}

function clearModelResetWarningTimer({
  timerRef,
  timerApi = globalThis,
} = {}) {
  if (!timerRef || timerRef.current == null) {
    return;
  }
  if (typeof timerApi?.clearTimeout === 'function') {
    timerApi.clearTimeout(timerRef.current);
  }
  timerRef.current = null;
}

function scheduleModelResetWarningClear({
  timerRef,
  onClear,
  delayMs = 5000,
  timerApi = globalThis,
} = {}) {
  if (!timerRef || typeof onClear !== 'function') {
    return null;
  }

  clearModelResetWarningTimer({ timerRef, timerApi });

  if (
    typeof timerApi?.setTimeout !== 'function'
    || typeof timerApi?.clearTimeout !== 'function'
  ) {
    timerRef.current = null;
    onClear();
    return null;
  }

  timerRef.current = timerApi.setTimeout(() => {
    timerRef.current = null;
    onClear();
  }, delayMs);

  return timerRef.current;
}

export const DesktopModelSelectionRuntime = Object.freeze({
  buildModelConfigUpdate,
  clearModelResetWarningTimer,
  evaluateModelSelection,
  getCurrentModels,
  getFallbackModelSelection,
  scheduleModelResetWarningClear,
});
