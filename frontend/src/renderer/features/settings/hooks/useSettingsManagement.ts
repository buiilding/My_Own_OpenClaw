import { useCallback, useMemo } from 'react';

/**
 * Custom hook for managing settings-related backend events.
 * Currently only handles model listing (config is frontend-only now).
 *
 * @param {Function} setConfig - Function to update config state (unused, kept for compatibility)
 * @param {Function} setAvailableModels - Function to update available models state
 * @param {Function} setSaveStatus - Optional function (unused, kept for compatibility)
 * @param {any} configBeforeSave - Unused (kept for compatibility)
 * @param {any} saveTimeoutId - Unused (kept for compatibility)
 * @param {any} lastSaveTimestamp - Unused (kept for compatibility)
 * @returns {Object} - Object containing settings handlers
 */
export function useSettingsManagement(
  _setConfig: (config: unknown) => void,
  setAvailableModels: (models: unknown) => void,
  _setSaveStatus: (status: string) => void = () => {},
  _configBeforeSave: unknown = null,
  _saveTimeoutId: unknown = null,
  _lastSaveTimestamp: unknown = null
) {
  const handleModelsListed = useCallback((data: { payload?: unknown }) => {
    setAvailableModels(data.payload);
  }, [setAvailableModels]);

  return useMemo(() => ({
    handleModelsListed,
  }), [
    handleModelsListed
  ]);
}
