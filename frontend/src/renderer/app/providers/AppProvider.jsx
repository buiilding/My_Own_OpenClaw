import { useEffect, useRef } from 'react';
import { AppConfigProvider } from './AppConfigProvider';
import { AppStatusProvider } from './AppStatusProvider';
import { useAppConfigContext } from './AppConfigContext';
import { useAppStatusContext } from './AppStatusContext';

/**
 * Internal component that coordinates between AppConfigContext and AppStatusContext.
 * This ensures that when config is saved, the status context is notified.
 */
function AppContextCoordinator({ children }) {
  const configContext = useAppConfigContext();
  const statusContext = useAppStatusContext();
  const registerSaveStatusCallback = configContext?.registerSaveStatusCallback;
  const configRef = useRef(configContext?.config || {});
  const updateConfigRef = useRef(configContext?.updateConfig);

  useEffect(() => {
    configRef.current = configContext?.config || {};
    updateConfigRef.current = configContext?.updateConfig;
  }, [configContext?.config, configContext?.updateConfig]);

  useEffect(() => {
    if (registerSaveStatusCallback) {
      registerSaveStatusCallback(statusContext.setSaving);
    }
  }, [registerSaveStatusCallback, statusContext.setSaving]);

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

      event.preventDefault();
      const currentConfig = configRef.current || {};
      const currentMode = currentConfig.interaction_mode || 'chat';
      const nextMode = currentMode === 'chat' ? 'agent' : 'chat';
      if (typeof updateConfigRef.current !== 'function') {
        return;
      }
      updateConfigRef.current({
        ...currentConfig,
        interaction_mode: nextMode,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return <>{children}</>;
}

/**
 * AppProvider - Combines AppConfigProvider and AppStatusProvider.
 *
 * This maintains backward compatibility while using split contexts internally.
 * Components can use useAppConfigContext() and useAppStatusContext() directly
 * for better performance, or use the legacy useAppContext() for convenience.
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
