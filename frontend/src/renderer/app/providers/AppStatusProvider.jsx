import { useState, useEffect, useRef, useCallback } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';
import { AppStatusContext } from './AppStatusContext';

/**
 * AppStatusProvider - Manages transient application status.
 *
 * This context holds state that changes during operations:
 * - saveStatus: Status of settings save operations (idle, saving, success, error)
 *
 * This context is separate from AppConfigContext because saveStatus changes
 * more frequently (during save operations) and we want to avoid re-rendering
 * components that only need config data.
 */
export function AppStatusProvider({ children }) {
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimeoutId = useRef(null);

  const onBackendEvent = useCallback((data) => {
    switch (data.type) {
      case 'settings-updated':
        if (saveTimeoutId.current) {
          clearTimeout(saveTimeoutId.current);
        }
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
        break;
      case 'error':
        if (data.payload?.message?.includes('Failed to update settings')) {
          if (saveTimeoutId.current) {
            clearTimeout(saveTimeoutId.current);
          }
          setSaveStatus('error');
          setTimeout(() => setSaveStatus('idle'), 3000);
        }
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, onBackendEvent);
    return () => {
      removeListener();
    };
  }, [onBackendEvent]);

  const setSaving = useCallback(() => {
    setSaveStatus('saving');
    saveTimeoutId.current = setTimeout(() => {
      setSaveStatus('error');
    }, 10000);
  }, []);

  const value = {
    saveStatus,
    setSaving
  };

  return (
    <AppStatusContext.Provider value={value}>
      {children}
    </AppStatusContext.Provider>
  );
}
