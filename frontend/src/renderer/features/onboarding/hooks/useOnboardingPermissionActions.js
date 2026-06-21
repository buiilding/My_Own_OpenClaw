/**
 * Provides the use onboarding permission actions module for the renderer UI.
 */

import { useEffect, useRef, useState } from 'react';
import { DesktopRendererConfigRuntimeClient } from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopPermissionGrantEffectsRuntime } from '../../../app/runtime/desktopPermissionGrantEffectsRuntime';
import { usePermissionStore } from '../../permissions/stores/permissionStore';

const {
  applyPermissionGrantEffects,
  createExternalPermissionGrantWatcher,
  shouldWatchExternalPermissionGrantCompletion,
} = DesktopPermissionGrantEffectsRuntime;

export function useOnboardingPermissionActions() {
  const isLoading = usePermissionStore((state) => state.isLoading);
  const requestPermission = usePermissionStore((state) => state.requestPermission);
  const runPermissionProbe = usePermissionStore((state) => state.runPermissionProbe);
  const { updateConfig } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const [pendingPermissionId, setPendingPermissionId] = useState('');
  const [waitingPermissionId, setWaitingPermissionId] = useState('');
  const permissionGrantWatcherRef = useRef(null);

  useEffect(() => {
    const watcher = createExternalPermissionGrantWatcher({
      runPermissionProbe,
      setWaitingPermissionId,
    });
    permissionGrantWatcherRef.current = watcher;

    return () => {
      watcher.dispose();
      if (permissionGrantWatcherRef.current === watcher) {
        permissionGrantWatcherRef.current = null;
      }
    };
  }, [runPermissionProbe]);

  async function handleGrantPermission(permissionId) {
    if (!permissionId) {
      return null;
    }

    setPendingPermissionId(permissionId);
    try {
      const status = await requestPermission(permissionId);
      applyPermissionGrantEffects({ permissionId, status, updateConfig });
      if (shouldWatchExternalPermissionGrantCompletion(permissionId, status)) {
        permissionGrantWatcherRef.current?.start(permissionId);
      } else {
        permissionGrantWatcherRef.current?.stopWhenGrantComplete(permissionId, status);
      }
      return status;
    } finally {
      setPendingPermissionId('');
    }
  }

  return {
    isLoading,
    pendingPermissionId,
    waitingPermissionId,
    handleGrantPermission,
  };
}
