import { useEffect } from 'react';
import { AppConfigProvider } from './AppConfigProvider';
import { AppStatusProvider } from './AppStatusProvider';
import { useAppConfigContext } from './AppConfigContext';
import { useAppStatusContext } from './AppStatusContext';
import { useLatestRef } from '../../infrastructure/hooks/useLatestRef';

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]';

function isEditableShortcutTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(EDITABLE_SELECTOR)) {
    return true;
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

/**
 * Internal component that coordinates between AppConfigContext and AppStatusContext.
 * This ensures that when config is saved, the status context is notified.
 */
function AppContextCoordinator({ children }) {
  const configContext = useAppConfigContext();
  const statusContext = useAppStatusContext();
  const registerSaveStatusCallback = configContext?.registerSaveStatusCallback;
  const configRef = useLatestRef(configContext?.config || {});
  const updateConfigRef = useLatestRef(configContext?.updateConfig);

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

      if (typeof updateConfigRef.current !== 'function') {
        return;
      }
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      event.preventDefault();
      const currentConfig = configRef.current || {};
      const currentMode = currentConfig.interaction_mode || 'chat';
      const nextMode = currentMode === 'chat' ? 'agent' : 'chat';
      updateConfigRef.current({
        ...currentConfig,
        interaction_mode: nextMode,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [configRef, updateConfigRef]);

  return <>{children}</>;
}

/**
 * AppProvider - Combines AppConfigProvider and AppStatusProvider.
 *
 * This maintains backward compatibility while using split contexts internally.
 * Components should use useAppConfigContext() and useAppStatusContext() directly.
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
