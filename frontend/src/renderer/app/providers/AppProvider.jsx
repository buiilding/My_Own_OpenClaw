import { useEffect } from 'react';
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

  useEffect(() => {
    if (configContext.registerSaveStatusCallback) {
      configContext.registerSaveStatusCallback(statusContext.setSaving);
    }
  }, [configContext, statusContext]);

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
      const currentConfig = configContext?.config || {};
      const currentMode = currentConfig.interaction_mode || 'chat';
      const nextMode = currentMode === 'chat' ? 'agent' : 'chat';
      configContext.updateConfig({
        ...currentConfig,
        interaction_mode: nextMode,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [configContext]);

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
