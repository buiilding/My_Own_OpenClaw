import { useCallback, useMemo } from 'react';
import { filterFrontendConfig } from '../../../utils/configFilter';
import { IpcBridge, SEND_CHANNELS } from '../../../infrastructure/ipc/bridge';

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
  setConfig: (config: any) => void,
  setAvailableModels: (models: any) => void,
  setSaveStatus: (status: string) => void,
  configBeforeSave: React.MutableRefObject<any>,
  saveTimeoutId: React.MutableRefObject<NodeJS.Timeout | null>
) {
  const handleSettingsLoaded = useCallback((data: any) => {
    // Filter config to only include fields that frontend manages
    const filteredConfig = filterFrontendConfig(data.payload);
    setConfig(filteredConfig);
    // Request available models when settings are loaded
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, { type: 'list-models' });
  }, [setConfig]);

  const handleModelsListed = useCallback((data: any) => {
    setAvailableModels(data.payload);
  }, [setAvailableModels]);

  const handleSettingsUpdated = useCallback(() => {
    if (saveTimeoutId.current) {
      clearTimeout(saveTimeoutId.current);
    }
    setSaveStatus('success');
    setTimeout(() => setSaveStatus('idle'), 3000);
  }, [setSaveStatus, saveTimeoutId]);

  const handleSettingsError = useCallback((data: any) => {
    if (data.payload?.message?.includes('Failed to update settings')) {
      if (saveTimeoutId.current) {
        clearTimeout(saveTimeoutId.current);
      }
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
