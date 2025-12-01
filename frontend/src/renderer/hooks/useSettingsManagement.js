import { useCallback, useMemo } from 'react';

/**
 * Custom hook for managing settings loading and updating.
 * Handles config loading, model fetching, and settings updates with error handling.
 *
 * @param {Function} setConfig - Function to update config state
 * @param {Function} setAvailableModels - Function to update available models state
 * @param {Function} setSaveStatus - Function to update save status state
 * @param {Object} configBeforeSave - Ref to store config before save attempt
 * @param {Object} saveTimeoutId - Ref to store timeout ID
 * @returns {Object} - Object containing settings handlers
 */
export function useSettingsManagement(
  setConfig,
  setAvailableModels,
  setSaveStatus,
  configBeforeSave,
  saveTimeoutId
) {
  const handleSettingsLoaded = useCallback((data) => {
    setConfig(data.payload);
    // Request available models when settings are loaded
    window.ipc.send('to-backend', { type: 'list-models' });
  }, [setConfig]);

  const handleModelsListed = useCallback((data) => {
    setAvailableModels(data.payload);
  }, [setAvailableModels]);

  const handleSettingsUpdated = useCallback(() => {
    clearTimeout(saveTimeoutId.current);
    setSaveStatus('success');
    setTimeout(() => setSaveStatus('idle'), 3000);
  }, [setSaveStatus, saveTimeoutId]);

  const handleSettingsError = useCallback((data) => {
    if (data.payload.message?.includes('Failed to update settings')) {
      clearTimeout(saveTimeoutId.current);
      setSaveStatus('error');
      // Revert to the old config on failure
      if (configBeforeSave.current) {
        setConfig(configBeforeSave.current);
        configBeforeSave.current = null;
      }
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [setSaveStatus, configBeforeSave, saveTimeoutId, setConfig]);

  return useMemo(() => ({
    handleSettingsLoaded,
    handleModelsListed,
    handleSettingsUpdated,
    handleSettingsError,
  }), [
    handleSettingsLoaded,
    handleModelsListed,
    handleSettingsUpdated,
    handleSettingsError
  ]);
}
