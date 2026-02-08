import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSettingsManagement } from '../../features/settings/hooks/useSettingsManagement';
import { filterFrontendConfig } from '../../utils/configFilter';
import { IpcBridge, ON_CHANNELS, SEND_CHANNELS, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';
import { ApiClient } from '../../infrastructure/api/client';
import { loadConfigFromStorage, saveConfigToStorage } from '../../utils/configStorage';
import { AppConfigContext } from './AppConfigContext';
import { updateTranscriptSession } from '../../infrastructure/transcript/TranscriptWriter';
import { extractTranscriptUserId, routeConfigBackendEvent } from './appConfigEvents';
import {
  applyConfigIfChanged,
  mergeFrontendProviderConfig,
  sanitizeFrontendProviderConfig,
} from './appConfigPersistence';

function logConfigInfo(message, ...args) {
  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env.NODE_ENV === 'test'
  ) {
    return;
  }
  console.log(message, ...args);
}

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

  const settingsHandlers = useSettingsManagement(
    setConfig,
    setAvailableModels,
    () => {},
    null,
    null,
    null
  );

  const handlersRef = useRef(settingsHandlers);
  const configRef = useRef(config);
  const saveStatusCallbackRef = useRef(null);

  const syncCurrentConfigToBackend = useCallback(() => {
    const currentConfig = configRef.current;
    if (currentConfig && typeof currentConfig === 'object') {
      ApiClient.updateSettings(currentConfig);
    }
  }, []);

  useEffect(() => {
    handlersRef.current = settingsHandlers;
  }, [settingsHandlers]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const registerSaveStatusCallback = useCallback((callback) => {
    saveStatusCallbackRef.current = typeof callback === 'function' ? callback : null;
  }, []);

  const onBackendEvent = useCallback((data) => {
    routeConfigBackendEvent(data, handlersRef);
  }, []);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, onBackendEvent);
    const view = new URLSearchParams(window.location.search).get('view');
    if (view !== 'chatbox') {
      logConfigInfo('[Config] Requesting available models...');
      IpcBridge.send(SEND_CHANNELS.TO_BACKEND, { type: 'list-models' });
    }

    return () => {
      removeListener();
    };
  }, [onBackendEvent]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.IPC_STATUS, (data) => {
      const userId = extractTranscriptUserId(data);
      if (userId) {
        updateTranscriptSession(undefined, userId);
      }
      if (data?.isConnected === true) {
        syncCurrentConfigToBackend();
      }
    });
    return () => {
      removeListener?.();
    };
  }, [syncCurrentConfigToBackend]);

  useEffect(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID)
      .then((result) => {
        const userId = extractTranscriptUserId(result);
        if (userId) {
          updateTranscriptSession(undefined, userId);
        }
        if (result?.isConnected === true) {
          syncCurrentConfigToBackend();
        }
      })
      .catch(() => {});
  }, [syncCurrentConfigToBackend]);

  useEffect(() => {
    let isMounted = true;

    IpcBridge.invoke(INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG).then((diskConfig) => {
      if (!isMounted || !diskConfig || typeof diskConfig !== 'object') {
        return;
      }
      const filteredConfig = sanitizeFrontendProviderConfig(
        mergeFrontendProviderConfig(configRef.current, filterFrontendConfig(diskConfig)),
      );
      const didApplyConfig = applyConfigIfChanged(filteredConfig, configRef, setConfig);
      if (!didApplyConfig) {
        return;
      }
      saveConfigToStorage(filteredConfig, Date.now());
      ApiClient.updateSettings(filteredConfig);
    }).catch((error) => {
      console.warn('[Config] Failed to load config from disk:', error?.message || error);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateConfig = useCallback((newConfig) => {
    const filteredConfig = sanitizeFrontendProviderConfig(
      mergeFrontendProviderConfig(configRef.current, filterFrontendConfig(newConfig)),
    );
    const didApplyConfig = applyConfigIfChanged(filteredConfig, configRef, setConfig);
    if (!didApplyConfig) {
      logConfigInfo('[Settings Update] No changes detected, skipping save');
      return;
    }

    if (saveStatusCallbackRef.current) {
      saveStatusCallbackRef.current();
    }

    logConfigInfo('[Settings Update] Updating config and saving to localStorage...');
    saveConfigToStorage(filteredConfig, Date.now());
    logConfigInfo('[Settings Update] Config saved to localStorage');
    IpcBridge.invoke(INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG, filteredConfig).catch((error) => {
      console.warn('[Settings Update] Failed to save config to disk:', error?.message || error);
    });
    ApiClient.updateSettings(filteredConfig);
  }, []);

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

  const value = useMemo(() => ({
    config,
    availableModels,
    wakewordEnabled,
    wakewordSuppressed,
    wakewordActive: wakewordEnabled && !wakewordSuppressed,
    setWakewordEnabled,
    updateConfig,
    registerSaveStatusCallback,
  }), [config, availableModels, wakewordEnabled, wakewordSuppressed, updateConfig, registerSaveStatusCallback]);

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}
