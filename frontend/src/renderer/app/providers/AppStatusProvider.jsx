/**
 * Provides the app status provider module for the renderer UI.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DesktopAppConfigRuntimeClient } from '../runtime/desktopAppConfigRuntimeClient';
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

  const onSettingsSaveStatusAction = useCallback((status) => {
    if (status === 'success' || status === 'error') {
      clearTimer(saveTimeoutId);
      setSaveStatus(status);
      scheduleIdleReset();
    }
  }, [clearTimer, scheduleIdleReset]);

  useEffect(() => {
    const removeListener = DesktopAppConfigRuntimeClient.onSettingsSaveStatusAction(
      onSettingsSaveStatusAction,
    );
    return () => {
      removeListener?.();
      clearTimer(saveTimeoutId);
      clearTimer(resetTimeoutId);
    };
  }, [onSettingsSaveStatusAction, clearTimer]);

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
