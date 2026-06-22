/**
 * Provides the app provider module for the renderer UI.
 */

import { useEffect } from 'react';
import { AppConfigProvider } from './AppConfigProvider';
import { AppStatusProvider } from './AppStatusProvider';
import { useAppConfigContext } from './AppConfigContext';
import { useAppStatusContext } from './AppStatusContext';
import { DesktopRendererHooksRuntimeClient } from '../runtime/desktopRendererHooksRuntimeClient';
import { DesktopAppProviderRuntime } from '../runtime/desktopAppProviderRuntime';
import { DesktopAppearanceThemeRuntime } from '../runtime/desktopAppearanceThemeRuntime';

const {
  useLatestRef,
} = DesktopRendererHooksRuntimeClient;

/**
 * Internal component that coordinates between AppConfigContext and AppStatusContext.
 * This ensures that when config is saved, the status context is notified.
 */
function AppContextCoordinator({ children }) {
  const configContext = useAppConfigContext();
  const statusContext = useAppStatusContext();
  const registerSaveStatusCallback = configContext?.registerSaveStatusCallback;
  const configRef = useLatestRef(configContext?.config || {});
  const updateConfigRef = useLatestRef(configContext?.updateConfig);
  const appearanceMode = configContext?.config?.appearance_mode;
  const appearanceTheme = configContext?.config?.appearance_theme;

  useEffect(() => {
    if (registerSaveStatusCallback) {
      registerSaveStatusCallback(statusContext.setSaving);
    }
  }, [registerSaveStatusCallback, statusContext.setSaving]);

  useEffect(() => DesktopAppearanceThemeRuntime.applyAppearanceTheme({
    appearance_mode: appearanceMode,
    appearance_theme: appearanceTheme,
  }), [appearanceMode, appearanceTheme]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        event.key !== 'Tab' ||
        !event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat
      ) {
        return;
      }

      if (typeof updateConfigRef.current !== 'function') {
        return;
      }
      if (DesktopAppProviderRuntime.isEditableShortcutTarget(event.target)) {
        return;
      }

      event.preventDefault();
      const currentConfig = configRef.current || {};
      const currentMode = currentConfig.interaction_mode || 'agent';
      const nextMode = currentMode === 'chat' ? 'agent' : 'chat';
      updateConfigRef.current({
        ...currentConfig,
        interaction_mode: nextMode,
      });
    };

    return DesktopAppProviderRuntime.subscribeToAppProviderKeyDown({
      onKeyDown: handleKeyDown,
    });
  }, [configRef, updateConfigRef]);

  return <>{children}</>;
}

/**
 * AppProvider - Combines AppConfigProvider and AppStatusProvider.
 */
export function AppProvider({ children }) {
  return (
    <AppConfigProvider>
      <AppStatusProvider>
        <AppContextCoordinator>
          {children}
        </AppContextCoordinator>
      </AppStatusProvider>
    </AppConfigProvider>
  );
}
