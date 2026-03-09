import { useCallback } from 'react';
import { IpcBridge, INVOKE_CHANNELS } from '../infrastructure/ipc/bridge';

export function useMainWindowControls({ warningPrefix = 'MainWindowControls' } = {}) {
  const invokeWindowAction = useCallback(async (channel, actionLabel, payload) => {
    try {
      return await IpcBridge.invoke(channel, payload);
    } catch (error) {
      console.warn(`[${warningPrefix}] Failed to ${actionLabel}:`, error);
      return null;
    }
  }, [warningPrefix]);

  const handleWindowMinimize = useCallback(() => {
    void invokeWindowAction(INVOKE_CHANNELS.WINDOW_MINIMIZE, 'minimize window');
  }, [invokeWindowAction]);

  const handleWindowToggleMaximize = useCallback(() => {
    void invokeWindowAction(INVOKE_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, 'toggle maximize window');
  }, [invokeWindowAction]);

  const handleWindowClose = useCallback(() => {
    void invokeWindowAction(INVOKE_CHANNELS.WINDOW_CLOSE, 'close window');
  }, [invokeWindowAction]);

  const showMainWindow = useCallback((options = {}) => {
    return invokeWindowAction(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, 'show main window', options);
  }, [invokeWindowAction]);

  return {
    handleWindowMinimize,
    handleWindowToggleMaximize,
    handleWindowClose,
    showMainWindow,
  };
}

export default useMainWindowControls;
