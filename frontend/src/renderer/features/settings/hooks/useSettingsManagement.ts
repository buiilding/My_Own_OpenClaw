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
  setConfig: (config: any) => void,
  setAvailableModels: (models: any) => void,
  setSaveStatus: (status: string) => void = () => {},
  configBeforeSave: any = null,
  saveTimeoutId: any = null,
  lastSaveTimestamp: any = null
) {
  const handleModelsListed = useCallback((data: any) => {
    setAvailableModels(data.payload);
  }, [setAvailableModels]);

  return useMemo(() => ({
    handleModelsListed,
  }), [
    handleModelsListed
  ]);
}
