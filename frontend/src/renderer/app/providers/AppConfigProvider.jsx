import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettingsManagement } from '../../features/settings/hooks/useSettingsManagement';
import { filterFrontendConfig } from '../../utils/configFilter';
import { IpcBridge, ON_CHANNELS, SEND_CHANNELS, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';
import { ApiClient } from '../../infrastructure/api/client';
import { loadConfigFromStorage, saveConfigToStorage } from '../../utils/configStorage';
import { AppConfigContext } from './AppConfigContext';
import { updateTranscriptSession } from '../../infrastructure/transcript/TranscriptWriter';
import { hasShallowConfigChanges } from './configComparison';

/**
 * AppConfigProvider - Manages application configuration and capabilities.
 *
 * This context holds state that changes infrequently:
 * - config: Application configuration (model settings, voice settings, etc.)
 * - availableModels: List of available LLM models
 * - wakewordEnabled: Wakeword detection preference (app-level, persists across chat unmounts)
 * - wakewordActive: Effective wakeword state (preference + suppression)
 *
 * Changes to this context are rare (only on app init, settings load, or explicit config updates).
 */
export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(() => {
    const storedConfig = loadConfigFromStorage();
    return storedConfig;
  });
  const [availableModels, setAvailableModels] = useState({ local: [], online: [] });
  const [wakewordEnabled, setWakewordEnabled] = useState(true);
  const [wakewordSuppressed, setWakewordSuppressed] = useState(true);

  const sanitizeConfig = useCallback((nextConfig) => ({
    ...nextConfig,
    voice_mode_enabled: false,
  }), []);

  const settingsHandlers = useSettingsManagement(
    setConfig,
    setAvailableModels,
    () => {},
    null,
    null,
    null
  );

  const handlersRef = useRef(settingsHandlers);
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
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, onBackendEvent);
    console.log('[Config] Requesting available models...');
    IpcBridge.send(SEND_CHANNELS.TO_BACKEND, { type: 'list-models' });

    return () => {
      removeListener();
    };
  }, [onBackendEvent]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.IPC_STATUS, (data) => {
      if (data?.userId) {
        updateTranscriptSession(undefined, data.userId);
      }
    });
    return () => {
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID)
      .then((result) => {
        if (result?.userId) {
          updateTranscriptSession(undefined, result.userId);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let isMounted = true;

    IpcBridge.invoke(INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG).then((diskConfig) => {
      if (!isMounted || !diskConfig || typeof diskConfig !== 'object') {
        return;
      }
      const filteredConfig = sanitizeConfig(filterFrontendConfig(diskConfig));
      if (Object.keys(filteredConfig).length === 0) {
        return;
      }
      setConfig(filteredConfig);
      saveConfigToStorage(filteredConfig, Date.now());
      ApiClient.updateSettings(filteredConfig);
    }).catch((error) => {
      console.warn('[Config] Failed to load config from disk:', error?.message || error);
    });

    return () => {
      isMounted = false;
    };
  }, [sanitizeConfig]);

  const updateConfig = useCallback((newConfig) => {
    const filteredConfig = sanitizeConfig(filterFrontendConfig(newConfig));

    if (!hasShallowConfigChanges(config, filteredConfig)) {
      console.log('[Settings Update] No changes detected, skipping save');
      return;
    }

    console.log('[Settings Update] Updating config and saving to localStorage...');
    setConfig(filteredConfig);

    saveConfigToStorage(filteredConfig, Date.now());
    console.log('[Settings Update] Config saved to localStorage');
    IpcBridge.invoke(INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG, filteredConfig).catch((error) => {
      console.warn('[Settings Update] Failed to save config to disk:', error?.message || error);
    });
    ApiClient.updateSettings(filteredConfig);
  }, [config, sanitizeConfig]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.WAKEWORD_TOGGLE, (data) => {
      if (typeof data?.enabled === 'boolean') {
        setWakewordSuppressed(!data.enabled);
      }
    });
    return () => {
      removeListener?.();
    };
  }, []);

  const value = {
    config,
    availableModels,
    wakewordEnabled,
    wakewordSuppressed,
    wakewordActive: wakewordEnabled && !wakewordSuppressed,
    setWakewordEnabled,
    updateConfig
  };

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}
