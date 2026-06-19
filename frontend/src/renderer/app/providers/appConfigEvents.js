/**
 * Defines app config events configuration for the renderer UI.
 */

export function routeConfigSettingsEvent(data, handlersRef) {
  if (data?.type === 'models-listed') {
    handlersRef.current.handleModelsListed(data);
  }
}
