/**
 * Coordinates desktop settings event handlers for renderer providers.
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

export function useDesktopSettingsEventHandlers(
  setAvailableModels: (models: unknown) => void,
) {
  const handleModelsListed = useCallback((data: { payload?: unknown }) => {
    if (!isListedModelsPayload(data.payload)) {
      return;
    }
    setAvailableModels(data.payload);
  }, [setAvailableModels]);

  return useMemo(() => ({
    handleModelsListed,
  }), [
    handleModelsListed,
  ]);
}
