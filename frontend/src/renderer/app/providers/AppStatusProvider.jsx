/**
 * Provides the app status provider module for the renderer UI.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DesktopAppConfigRuntimeClient } from '../runtime/desktopAppConfigRuntimeClient';
import { DesktopAppProviderRuntime } from '../runtime/desktopAppProviderRuntime';
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
    DesktopAppProviderRuntime.clearProviderTimer({
      timerRef,
    });
  }, []);

  const scheduleIdleReset = useCallback(() => {
    clearTimer(resetTimeoutId);
    DesktopAppProviderRuntime.scheduleProviderTimer({
      timerRef: resetTimeoutId,
      delayMs: 3000,
      callback: () => {
        setSaveStatus('idle');
      },
    });
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
    DesktopAppProviderRuntime.scheduleProviderTimer({
      timerRef: saveTimeoutId,
      delayMs: 10000,
      callback: () => {
        setSaveStatus('error');
        scheduleIdleReset();
      },
    });
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
