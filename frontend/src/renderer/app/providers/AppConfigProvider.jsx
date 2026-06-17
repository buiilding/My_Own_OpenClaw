/**
 * Defines app config provider configuration for the renderer UI.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSettingsManagement } from '../../features/settings/hooks/useSettingsManagement';
import { filterFrontendConfig } from '../../utils/configFilter';
import { IpcBridge, ON_CHANNELS, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';
import { loadConfigFromStorage, saveConfigToStorage } from '../../utils/configStorage';
import { AppConfigContext } from './AppConfigContext';
import { applyTranscriptSessionUserBinding } from '../../features/chat/session/conversationSessionRuntime';
import { extractTranscriptUserId, routeConfigSettingsEvent } from './appConfigEvents';
import { setBackendHttpUrl } from '../../infrastructure/services/BackendEndpointStore';
import { useLatestRef } from '../../infrastructure/hooks/useLatestRef';
import {
  applyConfigIfChanged,
  buildFrontendConfigPersistencePayload,
  mergeFrontendProviderConfig,
  sanitizeFrontendProviderConfig,
} from './appConfigPersistence';
import {
  buildImmediateRuntimeConfig,
  hasImmediateRuntimeConfigChanges,
} from './appConfigRuntimeSync';
import { DesktopSettingsRuntimeClient } from '../runtime/desktopSettingsRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../runtime/desktopTranscriptSessionRuntimeClient';

function resolveInitialWakewordSuppressed() {
  if (typeof window === 'undefined') {
    return true;
  }
  const view = new URLSearchParams(window.location.search).get('view');
  return Boolean(view);
}

function isWakewordEnabledInConfig(config) {
  return config?.wakeword_enabled !== false;
}

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
  const [wakewordSuppressed, setWakewordSuppressed] = useState(resolveInitialWakewordSuppressed);
  const [globalAgentStopShortcutStatus, setGlobalAgentStopShortcutStatus] = useState(null);

  const settingsHandlers = useSettingsManagement(setAvailableModels);

  const handlersRef = useLatestRef(settingsHandlers);
  const configRef = useLatestRef(config);
  const globalAgentStopShortcutStatusRef = useLatestRef(globalAgentStopShortcutStatus);
  const saveStatusCallbackRef = useRef(null);
  const backendConnectedRef = useRef(false);

  const syncCurrentConfigToRuntime = useCallback(() => {
    const currentConfig = configRef.current;
    if (currentConfig && typeof currentConfig === 'object') {
      const immediateRuntimeConfig = buildImmediateRuntimeConfig(currentConfig);
      if (immediateRuntimeConfig) {
        DesktopSettingsRuntimeClient.updateSettings(immediateRuntimeConfig);
      }
    }
  }, [configRef]);

  const buildMergedFrontendConfig = useCallback((incomingConfig) => {
    return sanitizeFrontendProviderConfig(
      mergeFrontendProviderConfig(configRef.current, filterFrontendConfig(incomingConfig)),
    );
  }, [configRef]);

  const commitFrontendConfig = useCallback((nextConfig, previousConfig, options = {}) => {
    const {
      notifySaving = false,
      persistToStorage = true,
      persistToDisk = true,
      syncRuntime = true,
    } = options;

    if (notifySaving && saveStatusCallbackRef.current) {
      saveStatusCallbackRef.current();
    }

    const persistenceConfig = buildFrontendConfigPersistencePayload(nextConfig);

    if (persistToStorage) {
      saveConfigToStorage(persistenceConfig);
    }
    if (persistToDisk) {
      IpcBridge.invoke(INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG, persistenceConfig).catch((error) => {
        console.warn('[Settings Update] Failed to save config to disk:', error?.message || error);
      });
    }

    if (!syncRuntime) {
      return;
    }

    const immediateRuntimeConfig = buildImmediateRuntimeConfig(nextConfig);
    if (immediateRuntimeConfig && hasImmediateRuntimeConfigChanges(previousConfig, nextConfig)) {
      DesktopSettingsRuntimeClient.updateSettings(immediateRuntimeConfig);
    }
  }, [saveStatusCallbackRef]);

  const applyResolvedConfig = useCallback((nextConfig, options = {}) => {
    const previousConfig = configRef.current;
    const didApplyConfig = applyConfigIfChanged(nextConfig, configRef, setConfig);
    if (!didApplyConfig) {
      return false;
    }

    commitFrontendConfig(nextConfig, previousConfig, options);
    return true;
  }, [commitFrontendConfig, configRef]);

  const applyFrontendConfigPatch = useCallback((incomingConfig, options = {}) => {
    return applyResolvedConfig(buildMergedFrontendConfig(incomingConfig), options);
  }, [applyResolvedConfig, buildMergedFrontendConfig]);

  const registerSaveStatusCallback = useCallback((callback) => {
    saveStatusCallbackRef.current = typeof callback === 'function' ? callback : null;
  }, []);

  const onSettingsEvent = useCallback((data) => {
    routeConfigSettingsEvent(data, handlersRef);
  }, [handlersRef]);

  const applyBackendConnectionSnapshot = useCallback((data) => {
    backendConnectedRef.current = data?.isConnected === true;

    const shortcutStatus = (
      data?.globalAgentStopShortcutStatus
      && typeof data.globalAgentStopShortcutStatus === 'object'
      && !Array.isArray(data.globalAgentStopShortcutStatus)
    ) ? data.globalAgentStopShortcutStatus : null;
    const previousShortcutStatus = globalAgentStopShortcutStatusRef.current;
    const shortcutStatusChanged = (
      JSON.stringify(previousShortcutStatus || null)
      !== JSON.stringify(shortcutStatus || null)
    );
    if (shortcutStatusChanged) {
      setGlobalAgentStopShortcutStatus(shortcutStatus);
    }

    const fallbackAccelerator = (
      shortcutStatus?.registrationFailed !== true
      && shortcutStatus?.usingFallback === true
      && typeof shortcutStatus?.resolvedAccelerator === 'string'
      && shortcutStatus.resolvedAccelerator.trim().length > 0
    ) ? shortcutStatus.resolvedAccelerator.trim() : null;
    if (
      fallbackAccelerator
      && configRef.current?.global_agent_stop_shortcut !== fallbackAccelerator
    ) {
      applyFrontendConfigPatch({
        global_agent_stop_shortcut: fallbackAccelerator,
      });
    }

    applyTranscriptSessionUserBinding({
      userId: extractTranscriptUserId(data),
      updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession,
    });
    setBackendHttpUrl(data?.backendHttpUrl);
    if (backendConnectedRef.current) {
      syncCurrentConfigToRuntime();
    }
  }, [
    applyFrontendConfigPatch,
    configRef,
    globalAgentStopShortcutStatusRef,
    syncCurrentConfigToRuntime,
  ]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.BACKEND_SETTINGS_EVENT, onSettingsEvent);

    return () => {
      removeListener();
    };
  }, [onSettingsEvent]);

  useEffect(() => {
    DesktopSettingsRuntimeClient.requestDashboardStartupModelList();
  }, []);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.IPC_STATUS, (data) => {
      applyBackendConnectionSnapshot(data);
    });
    return () => {
      removeListener?.();
    };
  }, [applyBackendConnectionSnapshot]);

  useEffect(() => {
    IpcBridge.invoke(INVOKE_CHANNELS.GET_CLIENT_USER_ID)
      .then((result) => {
        applyBackendConnectionSnapshot(result);
      })
      .catch(() => {});
  }, [applyBackendConnectionSnapshot]);

  useEffect(() => {
    let isMounted = true;

    IpcBridge.invoke(INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG).then((diskConfig) => {
      if (!isMounted || !diskConfig || typeof diskConfig !== 'object') {
        return;
      }
      const filteredConfig = buildMergedFrontendConfig(diskConfig);
      applyResolvedConfig(filteredConfig, {
        persistToDisk: false,
        syncRuntime: backendConnectedRef.current,
      });
    }).catch((error) => {
      console.warn('[Config] Failed to load config from disk:', error?.message || error);
    });

    return () => {
      isMounted = false;
    };
  }, [applyResolvedConfig, buildMergedFrontendConfig]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (
        event?.storageArea !== window.localStorage
        || (event?.key && !event.key.startsWith('desktop-assistant-config'))
      ) {
        return;
      }

      const syncedConfig = loadConfigFromStorage();
      if (!syncedConfig || typeof syncedConfig !== 'object') {
        return;
      }

      const filteredConfig = buildMergedFrontendConfig(syncedConfig);
      applyResolvedConfig(filteredConfig, {
        persistToStorage: false,
        persistToDisk: false,
        syncRuntime: false,
      });
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [applyResolvedConfig, buildMergedFrontendConfig]);

  const updateConfig = useCallback((newConfig) => {
    const didApplyConfig = applyFrontendConfigPatch(newConfig, {
      notifySaving: true,
      persistToDisk: true,
    });
    if (!didApplyConfig) {
      logConfigInfo('[Settings Update] No changes detected, skipping save');
      return false;
    }

    logConfigInfo('[Settings Update] Updating config and saving to localStorage...');
    logConfigInfo('[Settings Update] Config saved to localStorage');
    return true;
  }, [applyFrontendConfigPatch]);

  const setWakewordEnabled = useCallback((enabled) => {
    updateConfig({
      wakeword_enabled: enabled === true,
    });
  }, [updateConfig]);

  const wakewordEnabled = isWakewordEnabledInConfig(config);

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
    globalAgentStopShortcutStatus,
  }), [
    config,
    availableModels,
    wakewordEnabled,
    wakewordSuppressed,
    updateConfig,
    setWakewordEnabled,
    registerSaveStatusCallback,
    globalAgentStopShortcutStatus,
  ]);

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}
