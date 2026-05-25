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
  const resetTimeoutId = useRef(null);

  const clearTimer = useCallback((timerRef) => {
    if (!timerRef.current) {
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const scheduleIdleReset = useCallback(() => {
    clearTimer(resetTimeoutId);
    resetTimeoutId.current = setTimeout(() => {
      setSaveStatus('idle');
    }, 3000);
  }, [clearTimer]);

  const onBackendEvent = useCallback((data) => {
    switch (data.type) {
      case 'settings-updated':
        clearTimer(saveTimeoutId);
        setSaveStatus('success');
        scheduleIdleReset();
        break;
      case 'error':
        if (data.payload?.message?.includes('Failed to update settings')) {
          clearTimer(saveTimeoutId);
          setSaveStatus('error');
          scheduleIdleReset();
        }
        break;
      default:
        break;
    }
  }, [clearTimer, scheduleIdleReset]);

  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.BACKEND_SETTINGS_EVENT, onBackendEvent);
    return () => {
      removeListener();
      clearTimer(saveTimeoutId);
      clearTimer(resetTimeoutId);
    };
  }, [onBackendEvent, clearTimer]);

  const setSaving = useCallback(() => {
    clearTimer(saveTimeoutId);
    clearTimer(resetTimeoutId);
    setSaveStatus('saving');
    saveTimeoutId.current = setTimeout(() => {
      setSaveStatus('error');
      scheduleIdleReset();
    }, 10000);
  }, [clearTimer, scheduleIdleReset]);

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
