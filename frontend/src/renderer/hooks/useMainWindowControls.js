/**
 * Provides the use main window controls module for the renderer UI.
 */

import { useCallback } from 'react';
import { DesktopWindowRuntimeClient } from '../app/runtime/desktopWindowRuntimeClient';

export function useMainWindowControls({ warningPrefix = 'MainWindowControls' } = {}) {
  const invokeWindowAction = useCallback(async (action, actionLabel) => {
    try {
      return await action();
    } catch (error) {
      console.warn(`[${warningPrefix}] Failed to ${actionLabel}:`, error);
      return null;
    }
  }, [warningPrefix]);

  const handleWindowMinimize = useCallback(() => {
    void invokeWindowAction(() => DesktopWindowRuntimeClient.minimizeWindow(), 'minimize window');
  }, [invokeWindowAction]);

  const handleWindowToggleMaximize = useCallback(() => {
    void invokeWindowAction(() => DesktopWindowRuntimeClient.toggleMaximizeWindow(), 'toggle maximize window');
  }, [invokeWindowAction]);

  const handleWindowClose = useCallback(() => {
    void invokeWindowAction(() => DesktopWindowRuntimeClient.closeWindow(), 'close window');
  }, [invokeWindowAction]);

  const showMainWindow = useCallback((options = {}) => {
    return invokeWindowAction(() => DesktopWindowRuntimeClient.showMainWindowWithValues(
      options?.focus,
      options?.maximize,
      options?.open,
      options?.reason,
    ), 'show main window');
  }, [invokeWindowAction]);

  return {
    handleWindowMinimize,
    handleWindowToggleMaximize,
    handleWindowClose,
    showMainWindow,
  };
}
