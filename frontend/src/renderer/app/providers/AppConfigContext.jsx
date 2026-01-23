import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../../infrastructure/api/client';
import { useSettingsManagement } from '../../features/settings/hooks/useSettingsManagement';
import { filterFrontendConfig } from '../../utils/configFilter';
import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

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
  const [config, setConfig] = useState(null);
  const [availableModels, setAvailableModels] = useState({ local: [], online: [] });
  const [wakewordEnabled, setWakewordEnabled] = useState(true);
  
  const configBeforeSave = useRef(null);
  const saveTimeoutId = useRef(null);
  
  // Callback to notify status context about save status changes
  // Set by AppProvider coordination layer
  const onSaveStatusChangeRef = useRef(null);

  // Use existing hook logic for settings management
  const settingsHandlers = useSettingsManagement(
    setConfig,
    setAvailableModels,
    // saveStatus is handled by AppStatusContext, pass no-op here
    () => {},
    configBeforeSave,
    saveTimeoutId
  );

  // Store handlers in ref for stable IPC listener
  // This ensures the IPC listener callback never changes
  const handlersRef = useRef(settingsHandlers);
  useEffect(() => {
    handlersRef.current = settingsHandlers;
  }, [settingsHandlers]);

  // IPC event handler with stable identity
  // This callback never changes, ensuring listener lifecycle is correct
  const onBackendEvent = useCallback((data) => {
    switch (data.type) {
      case 'settings-loaded':
        handlersRef.current.handleSettingsLoaded(data);
        break;
      case 'models-listed':
        handlersRef.current.handleModelsListed(data);
        break;
      case 'settings-updated':
        // Config update is handled by AppStatusContext via its own IPC listener
        // No action needed here - config is already optimistically updated
        break;
      case 'error':
        if (data.payload?.message?.includes('Failed to update settings')) {
          handlersRef.current.handleSettingsError(data);
        }
        break;
      default:
        break;
    }
  }, []); // Empty deps - callback never changes

  // Listen for settings-related backend events
  useEffect(() => {
    // Defer settings load to next tick to allow initial render to complete
    // This prevents blocking the UI during startup
    const timeoutId = setTimeout(() => {
      ApiClient.loadSettings();
    }, 0);

    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, onBackendEvent);
    
    return () => {
      clearTimeout(timeoutId);
      removeListener();
    };
  }, [onBackendEvent]);

  const updateConfig = useCallback((newConfig) => {
    // Store the original config in case we need to revert
    configBeforeSave.current = config;

    // Filter config to only include fields that frontend manages
    const filteredConfig = filterFrontendConfig(newConfig);

    // Optimistically update the state
    setConfig(filteredConfig);
    
    // Notify status context that save is starting
    if (onSaveStatusChangeRef.current) {
      onSaveStatusChangeRef.current('saving');
    }

    // Fallback timeout in case backend never responds
    saveTimeoutId.current = setTimeout(() => {
      // Revert on timeout
      if (configBeforeSave.current) {
        setConfig(configBeforeSave.current);
        configBeforeSave.current = null;
      }
      if (onSaveStatusChangeRef.current) {
        onSaveStatusChangeRef.current('error');
      }
    }, 10000); // 10 second timeout

    // Only send the filtered config to backend
    ApiClient.updateSettings(filteredConfig);
  }, [config]);
  
  // Expose method to register save status callback
  // This is called by AppProvider coordination layer
  const registerSaveStatusCallback = useCallback((callback) => {
    onSaveStatusChangeRef.current = callback;
  }, []);

  const value = {
    config,
    availableModels,
    wakewordEnabled,
    setWakewordEnabled,
    updateConfig,
    registerSaveStatusCallback
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
