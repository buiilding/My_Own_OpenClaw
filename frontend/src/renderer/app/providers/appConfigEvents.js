/**
 * Defines app config events configuration for the renderer UI.
 */

export function routeConfigSettingsEvent(data, handlersRef) {
  if (data?.type === 'models-listed') {
    handlersRef.current.handleModelsListed(data);
  }
}

export function extractTranscriptUserId(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const userId = data.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    return null;
  }

  return userId;
}
