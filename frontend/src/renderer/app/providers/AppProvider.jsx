import React, { useEffect } from 'react';
import { AppConfigProvider, useAppConfigContext } from './AppConfigContext';
import { AppStatusProvider, useAppStatusContext } from './AppStatusContext';

/**
 * Internal component that coordinates between AppConfigContext and AppStatusContext.
 * This ensures that when config is saved, the status context is notified.
 */
function AppContextCoordinator({ children }) {
  const configContext = useAppConfigContext();
  const statusContext = useAppStatusContext();
  
  // Register save status callback when contexts are available
  useEffect(() => {
    if (configContext.registerSaveStatusCallback) {
      configContext.registerSaveStatusCallback(statusContext.setSaving);
    }
  }, [configContext, statusContext]);
  
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

// Re-export for convenience
export { useAppConfigContext } from './AppConfigContext';
export { useAppStatusContext } from './AppStatusContext';

// Legacy hook for backward compatibility
// This combines both contexts but causes re-renders when either changes
// Prefer using useAppConfigContext() and useAppStatusContext() separately
export const useAppContext = () => {
  const config = useAppConfigContext();
  const status = useAppStatusContext();
  
  return {
    ...config,
    saveStatus: status.saveStatus
  };
};
