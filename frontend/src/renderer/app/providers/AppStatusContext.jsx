import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

/**
 * AppStatusContext - Manages transient application status.
 * 
 * This context holds state that changes during operations:
 * - saveStatus: Status of settings save operations (idle, saving, success, error)
 * 
 * This context is separate from AppConfigContext because saveStatus changes
 * more frequently (during save operations) and we want to avoid re-rendering
 * components that only need config data.
 */

const AppStatusContext = createContext();

export function AppStatusProvider({ children }) {
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, saving, success, error
  const saveTimeoutId = useRef(null);

  // IPC event handler with stable identity
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

  // Listen for settings-related backend events
  useEffect(() => {
    const removeListener = IpcBridge.on(ON_CHANNELS.FROM_BACKEND, onBackendEvent);
    return () => {
      removeListener();
    };
  }, [onBackendEvent]);

  // Expose method to set saving status (called by AppConfigContext when save starts)
  const setSaving = useCallback(() => {
    setSaveStatus('saving');
    // Set timeout for error fallback
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

export const useAppStatusContext = () => {
  const context = useContext(AppStatusContext);
  if (!context) {
    throw new Error('useAppStatusContext must be used within an AppStatusProvider');
  }
  return context;
};
