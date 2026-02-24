import { useCallback, useMemo } from 'react';

/**
 * Custom hook for managing settings-related backend events.
 * Currently only handles model listing (config is frontend-only now).
 *
 * @param {Function} setAvailableModels - Function to update available models state
 * @returns {Object} - Object containing settings handlers
 */
export function useSettingsManagement(setAvailableModels: (models: unknown) => void) {
  const handleModelsListed = useCallback((data: { payload?: unknown }) => {
    setAvailableModels(data.payload);
  }, [setAvailableModels]);

  return useMemo(() => ({
    handleModelsListed,
  }), [
    handleModelsListed
  ]);
}
