/**
 * Defines app config provider configuration for the renderer UI.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { filterRendererConfig } from '../runtime/desktopRendererConfigFilterRuntime';
import { loadConfigFromStorage, saveConfigToStorage } from '../runtime/desktopRendererConfigStorageRuntime';
import { AppConfigContext } from './AppConfigContext';
import { routeConfigSettingsEvent } from './appConfigEvents';
import { useLatestRef } from '../runtime/desktopRendererHooksRuntimeClient';
import {
  applyConfigIfChanged,
  buildRendererConfigPersistencePayload,
  mergeRendererProviderConfig,
  sanitizeRendererProviderConfig,
} from './appConfigPersistence';
import {
  buildImmediateRuntimeConfig,
  hasImmediateRuntimeConfigChanges,
} from './appConfigRuntimeSync';
import { DesktopAppConfigRuntimeClient } from '../runtime/desktopAppConfigRuntimeClient';
import { DesktopClientSessionRuntimeClient } from '../runtime/desktopClientSessionRuntimeClient';
import { DesktopRuntimeEndpointClient } from '../runtime/desktopRuntimeEndpointClient';
import { useDesktopSettingsEventHandlers } from '../runtime/desktopSettingsEventRuntimeClient';
import { DesktopSettingsRuntimeClient } from '../runtime/desktopSettingsRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopVoiceRuntimeClient } from '../runtime/desktopVoiceRuntimeClient';
import { RENDERER_STORAGE_KEYS } from '../skin/desktopRuntimeConfig';

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

  const settingsHandlers = useDesktopSettingsEventHandlers(setAvailableModels);

  const handlersRef = useLatestRef(settingsHandlers);
  const configRef = useLatestRef(config);
  const globalAgentStopShortcutStatusRef = useLatestRef(globalAgentStopShortcutStatus);
  const saveStatusCallbackRef = useRef(null);
  const runtimeConnectedRef = useRef(false);

  const syncCurrentConfigToRuntime = useCallback(() => {
    const currentConfig = configRef.current;
    if (currentConfig && typeof currentConfig === 'object') {
      const immediateRuntimeConfig = buildImmediateRuntimeConfig(currentConfig);
      if (immediateRuntimeConfig) {
        DesktopSettingsRuntimeClient.updateSettings(immediateRuntimeConfig);
      }
    }
  }, [configRef]);

  const buildMergedRendererConfig = useCallback((incomingConfig) => {
    return sanitizeRendererProviderConfig(
      mergeRendererProviderConfig(configRef.current, filterRendererConfig(incomingConfig)),
    );
  }, [configRef]);

  const commitRendererConfig = useCallback((nextConfig, previousConfig, options = {}) => {
    const {
      notifySaving = false,
      persistToStorage = true,
      persistToDisk = true,
      syncRuntime = true,
    } = options;

    if (notifySaving && saveStatusCallbackRef.current) {
      saveStatusCallbackRef.current();
    }

    const persistenceConfig = buildRendererConfigPersistencePayload(nextConfig);

    if (persistToStorage) {
      saveConfigToStorage(persistenceConfig);
    }
    if (persistToDisk) {
      DesktopAppConfigRuntimeClient.saveRendererConfig(persistenceConfig).catch((error) => {
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

    commitRendererConfig(nextConfig, previousConfig, options);
    return true;
  }, [commitRendererConfig, configRef]);

  const applyRendererConfigPatch = useCallback((incomingConfig, options = {}) => {
    return applyResolvedConfig(buildMergedRendererConfig(incomingConfig), options);
  }, [applyResolvedConfig, buildMergedRendererConfig]);

  const registerSaveStatusCallback = useCallback((callback) => {
    saveStatusCallbackRef.current = typeof callback === 'function' ? callback : null;
  }, []);

  const onSettingsEvent = useCallback((data) => {
    routeConfigSettingsEvent(data, handlersRef);
  }, [handlersRef]);

  const applyRuntimeConnectionSnapshot = useCallback((statusValues) => {
    const {
      snapshot,
      transcriptUserId,
      isConnected,
      globalAgentStopShortcutStatus: shortcutStatus,
    } = statusValues;
    runtimeConnectedRef.current = isConnected;

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
      applyRendererConfigPatch({
        global_agent_stop_shortcut: fallbackAccelerator,
      });
    }

    if (transcriptUserId !== null) {
      DesktopTranscriptSessionRuntimeClient.bindTranscriptUser(transcriptUserId);
    }
    DesktopRuntimeEndpointClient.syncFromConnectionSnapshot(snapshot);
    if (runtimeConnectedRef.current) {
      syncCurrentConfigToRuntime();
    }
  }, [
    applyRendererConfigPatch,
    configRef,
    globalAgentStopShortcutStatusRef,
    syncCurrentConfigToRuntime,
  ]);

  useEffect(() => {
    const removeListener = DesktopAppConfigRuntimeClient.onSettingsEvent(onSettingsEvent);

    return () => {
      removeListener?.();
    };
  }, [onSettingsEvent]);

  useEffect(() => {
    DesktopSettingsRuntimeClient.requestDashboardStartupModelList();
  }, []);

  useEffect(() => {
    const removeListener = DesktopClientSessionRuntimeClient.onIpcStatusValues(
      applyRuntimeConnectionSnapshot,
    );
    return () => {
      removeListener?.();
    };
  }, [applyRuntimeConnectionSnapshot]);

  useEffect(() => {
    DesktopClientSessionRuntimeClient.loadMainSessionSnapshot()
      .then((result) => {
        applyRuntimeConnectionSnapshot(
          DesktopClientSessionRuntimeClient.resolveIpcStatusValues(result),
        );
      })
      .catch(() => {});
  }, [applyRuntimeConnectionSnapshot]);

  useEffect(() => {
    let isMounted = true;

    DesktopAppConfigRuntimeClient.loadRendererConfig().then((diskConfig) => {
      if (!isMounted || !diskConfig || typeof diskConfig !== 'object') {
        return;
      }
      const filteredConfig = buildMergedRendererConfig(diskConfig);
      applyResolvedConfig(filteredConfig, {
        persistToDisk: false,
        syncRuntime: runtimeConnectedRef.current,
      });
    }).catch((error) => {
      console.warn('[Config] Failed to load config from disk:', error?.message || error);
    });

    return () => {
      isMounted = false;
    };
  }, [applyResolvedConfig, buildMergedRendererConfig]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (
        event?.storageArea !== window.localStorage
        || (event?.key && event.key !== RENDERER_STORAGE_KEYS.config)
      ) {
        return;
      }

      const syncedConfig = loadConfigFromStorage();
      if (!syncedConfig || typeof syncedConfig !== 'object') {
        return;
      }

      const filteredConfig = buildMergedRendererConfig(syncedConfig);
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
  }, [applyResolvedConfig, buildMergedRendererConfig]);

  const updateConfig = useCallback((newConfig) => {
    const didApplyConfig = applyRendererConfigPatch(newConfig, {
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
  }, [applyRendererConfigPatch]);

  const setWakewordEnabled = useCallback((enabled) => {
    updateConfig({
      wakeword_enabled: enabled === true,
    });
  }, [updateConfig]);

  const wakewordEnabled = isWakewordEnabledInConfig(config);

  useEffect(() => {
    const removeListener = DesktopVoiceRuntimeClient.onWakewordToggleState(({ enabled }) => {
      setWakewordSuppressed(!enabled);
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
