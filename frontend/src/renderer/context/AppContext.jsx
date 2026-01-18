import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../api/client';
import { useSettingsManagement } from '../hooks/useSettingsManagement';
import { filterFrontendConfig } from '../utils/configFilter';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, saving, success, error
  const [availableModels, setAvailableModels] = useState({ local: [], online: [] });
  const [wakewordEnabled, setWakewordEnabled] = useState(true);
  
  const configBeforeSave = useRef(null);
  const saveTimeoutId = useRef(null);

  // Use existing hook logic for settings management
  const settingsHandlers = useSettingsManagement(
    setConfig,
    setAvailableModels,
    setSaveStatus,
    configBeforeSave,
    saveTimeoutId
  );

  // Listen for settings-related backend events
  useEffect(() => {
    // Initial load
    ApiClient.loadSettings();

    const removeListener = window.ipc.on('from-backend', (data) => {
       switch (data.type) {
         case 'settings-loaded':
           settingsHandlers.handleSettingsLoaded(data);
           break;
         case 'models-listed':
           settingsHandlers.handleModelsListed(data);
           break;
         case 'settings-updated':
           settingsHandlers.handleSettingsUpdated();
           break;
         case 'error':
           if (data.payload.message?.includes('Failed to update settings')) {
             settingsHandlers.handleSettingsError(data);
           }
           break;
         default:
           break;
       }
    });
    return removeListener;
  }, [settingsHandlers]);

  const updateConfig = useCallback((newConfig) => {
    // Prevent concurrent saves
    if (saveStatus === 'saving') {
      return;
    }

    // Store the original config in case we need to revert
    configBeforeSave.current = config;

    // Filter config to only include fields that frontend manages
    const filteredConfig = filterFrontendConfig(newConfig);

    // Optimistically update the state and set status to saving
    setConfig(filteredConfig);
    setSaveStatus('saving');

    // Fallback timeout in case backend never responds
    saveTimeoutId.current = setTimeout(() => {
      setSaveStatus('error');
      if (configBeforeSave.current) {
        setConfig(configBeforeSave.current);
        configBeforeSave.current = null;
      }
    }, 10000); // 10 second timeout

    // Only send the filtered config to backend
    ApiClient.updateSettings(filteredConfig);
  }, [config, saveStatus]);

  const value = {
    config,
    saveStatus,
    availableModels,
    wakewordEnabled,
    setWakewordEnabled,
    updateConfig
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

