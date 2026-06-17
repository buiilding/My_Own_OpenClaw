/**
 * Defines use settings management configuration for the renderer UI.
 */

import { useCallback, useMemo } from 'react';

type ListedModelsPayload = {
  local?: unknown[];
  online?: unknown[];
  local_models?: unknown[];
  online_models?: unknown[];
};

function isListedModelsPayload(payload: unknown): payload is ListedModelsPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const modelPayload = payload as ListedModelsPayload;
  if ('local' in modelPayload || 'online' in modelPayload) {
    return Array.isArray(modelPayload.local) && Array.isArray(modelPayload.online);
  }
  return (
    Array.isArray(modelPayload.local_models)
    && Array.isArray(modelPayload.online_models)
  );
}

/**
 * Custom hook for managing settings-runtime events.
 * Currently only handles model listing (config is frontend-only now).
 *
 * @param {Function} setAvailableModels - Function to update available models state
 * @returns {Object} - Object containing settings handlers
 */
export function useSettingsManagement(setAvailableModels: (models: unknown) => void) {
  const handleModelsListed = useCallback((data: { payload?: unknown }) => {
    if (!isListedModelsPayload(data.payload)) {
      return;
    }
    setAvailableModels(data.payload);
  }, [setAvailableModels]);

  return useMemo(() => ({
    handleModelsListed,
  }), [
    handleModelsListed
  ]);
}
