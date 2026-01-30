import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSettingsManagement } from '../../features/settings/hooks/useSettingsManagement';
import { filterFrontendConfig } from '../../utils/configFilter';
import { IpcBridge, ON_CHANNELS, SEND_CHANNELS } from '../../infrastructure/ipc/bridge';
import { loadConfigFromStorage, saveConfigToStorage } from '../../utils/configStorage';

/**
 * AppConfigContext - Manages application configuration and capabilities.
 * 
 * This context holds state that changes infrequently:
 * - config: Application configuration (model settings, voice settings, etc.)
 * - availableModels: List of available LLM models
 * - wakewordEnabled: Wakeword detection capability (app-level, persists across chat unmounts)
 * 
 * Changes to this context are rare (only on app init, settings load, or explicit config updates).
 */

const AppConfigContext = createContext();

export function AppConfigProvider({ children }) {
  // Load from localStorage immediately on mount (optimistic state - zero latency)
  const [config, setConfig] = useState(() => {
    const storedConfig = loadConfigFromStorage();
    return storedConfig;
  });
  const [availableModels, setAvailableModels] = useState({ local: [], online: [] });
  const [wakewordEnabled, setWakewordEnabled] = useState(true);

  // Use existing hook logic for settings management (only for model listing now)
  const settingsHandlers = useSettingsManagement(
    setConfig,
    setAvailableModels,
    () => {}, // saveStatus no-op
    null, // configBeforeSave not needed
    null, // saveTimeoutId not needed
    null  // lastSaveTimestamp not needed
  );

  const handlersRef = React.useRef(settingsHandlers);
  useEffect(() => {
    handlersRef.current = settingsHandlers;
  }, [settingsHandlers]);

  const onBackendEvent = useCallback((data) => {
    switch (data.type) {
      case 'models-listed':
        handlersRef.current.handleModelsListed(data);
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    // Request models list on mount (no config sync needed - frontend manages config)
    const timeoutId = setTimeout(() => {
      console.log('[Config] Requesting available models...');
      IpcBridge.send(SEND_CHANNELS.TO_BACKEND, { type: 'list-models' });
    }, 0);

    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, onBackendEvent);
    
    return () => {
      clearTimeout(timeoutId);
      removeListener();
    };
  }, [onBackendEvent]);

  const updateConfig = useCallback((newConfig) => {
    // Filter config to only include fields that frontend manages
    const filteredConfig = filterFrontendConfig(newConfig);
    
    // Check if anything actually changed
    let hasChanges = false;
    for (const key in filteredConfig) {
      if (filteredConfig[key] !== config?.[key]) {
        hasChanges = true;
        break;
      }
    }
    
    // If nothing changed, skip
    if (!hasChanges) {
      console.log('[Settings Update] No changes detected, skipping save');
      return;
    }
    
    console.log('[Settings Update] Updating config and saving to localStorage...');
    // Update state immediately
    setConfig(filteredConfig);
    
    // Save to localStorage immediately (frontend-only storage)
    saveConfigToStorage(filteredConfig, Date.now());
    console.log('[Settings Update] Config saved to localStorage');
  }, [config]);

  const value = {
    config,
    availableModels,
    wakewordEnabled,
    setWakewordEnabled,
    updateConfig
  };

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export const useAppConfigContext = () => {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error('useAppConfigContext must be used within an AppConfigProvider');
  }
  return context;
};
