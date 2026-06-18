/**
 * Exposes renderer config helpers that runtime-facing feature code can share.
 */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildDeferredQueryModelSelection(config) {
  if (!isPlainObject(config)) {
    return null;
  }
  const modelId = typeof config.selected_model_id === 'string'
    ? config.selected_model_id.trim()
    : '';
  const modelProvider = typeof config.model_provider === 'string'
    ? config.model_provider.trim()
    : '';
  if (!modelId || !modelProvider) {
    return null;
  }
  return {
    modelId,
    modelProvider,
  };
}
