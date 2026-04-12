import { useEffect, useRef, useState } from 'react';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { usePermissionStore } from '../../permissions/stores/permissionStore';
import { applyPermissionGrantEffects } from '../../permissions/utils/permissionGrantEffects';

const MACOS_INTERVAL_RECHECK_PERMISSION_IDS = new Set([
  'screen_capture',
  'input_control_accessibility',
  'system_events_automation',
  'microphone',
]);
const PERMISSION_RECHECK_INTERVAL_MS = 1000;
const PERMISSION_RECHECK_TIMEOUT_MS = 2 * 60 * 1000;

function shouldWatchExternalGrantCompletion(permissionId, status) {
  if (permissionId === 'screen_capture' && status?.details?.media_status === 'granted') {
    return false;
  }
  return (
    MACOS_INTERVAL_RECHECK_PERMISSION_IDS.has(permissionId)
    && status?.granted !== true
    && status?.status === 'needs-action'
  );
}

function stopWatchingPermission({
  watchedPermissionIdRef,
  recheckIntervalRef,
  recheckDeadlineRef,
  setWaitingPermissionId,
}) {
  watchedPermissionIdRef.current = '';
  recheckDeadlineRef.current = 0;
  if (typeof setWaitingPermissionId === 'function') {
    setWaitingPermissionId('');
  }
  if (typeof window !== 'undefined' && recheckIntervalRef.current) {
    window.clearInterval(recheckIntervalRef.current);
    recheckIntervalRef.current = null;
  }
}

async function recheckWatchedPermission({
  runPermissionProbe,
  watchedPermissionIdRef,
  recheckDeadlineRef,
  recheckIntervalRef,
  setWaitingPermissionId,
}) {
  const permissionId = watchedPermissionIdRef.current;
  if (!permissionId) {
    return null;
  }

  const status = typeof runPermissionProbe === 'function'
    ? await runPermissionProbe(permissionId)
    : null;
  if (status?.granted === true || Date.now() >= recheckDeadlineRef.current) {
    stopWatchingPermission({
      watchedPermissionIdRef,
      recheckIntervalRef,
      recheckDeadlineRef,
      setWaitingPermissionId,
    });
  }
  return status;
}

export function useOnboardingPermissionActions() {
  const isLoading = usePermissionStore((state) => state.isLoading);
  const requestPermission = usePermissionStore((state) => state.requestPermission);
  const runPermissionProbe = usePermissionStore((state) => state.runPermissionProbe);
  const { updateConfig } = useAppConfigContext();
  const [pendingPermissionId, setPendingPermissionId] = useState('');
  const [waitingPermissionId, setWaitingPermissionId] = useState('');
  const watchedPermissionIdRef = useRef('');
  const recheckIntervalRef = useRef(null);
  const recheckDeadlineRef = useRef(0);

  const startWatchingPermission = (permissionId) => {
    if (typeof window === 'undefined' || !permissionId) {
      return;
    }

    const shouldPollByInterval = MACOS_INTERVAL_RECHECK_PERMISSION_IDS.has(permissionId);
    stopWatchingPermission({
      watchedPermissionIdRef,
      recheckIntervalRef,
      recheckDeadlineRef,
      setWaitingPermissionId,
    });
    watchedPermissionIdRef.current = permissionId;
    recheckDeadlineRef.current = Date.now() + PERMISSION_RECHECK_TIMEOUT_MS;
    setWaitingPermissionId(permissionId);
    if (shouldPollByInterval) {
      recheckIntervalRef.current = window.setInterval(() => {
        void recheckWatchedPermission({
          runPermissionProbe,
          watchedPermissionIdRef,
          recheckIntervalRef,
          recheckDeadlineRef,
          setWaitingPermissionId,
        });
      }, PERMISSION_RECHECK_INTERVAL_MS);
      void recheckWatchedPermission({
        runPermissionProbe,
        watchedPermissionIdRef,
        recheckIntervalRef,
        recheckDeadlineRef,
        setWaitingPermissionId,
      });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const handleWindowAttention = () => {
      if (document.hidden || !watchedPermissionIdRef.current) {
        return;
      }
      void recheckWatchedPermission({
        runPermissionProbe,
        watchedPermissionIdRef,
        recheckIntervalRef,
        recheckDeadlineRef,
        setWaitingPermissionId,
      });
    };

    window.addEventListener('focus', handleWindowAttention);
    document.addEventListener('visibilitychange', handleWindowAttention);

    return () => {
      window.removeEventListener('focus', handleWindowAttention);
      document.removeEventListener('visibilitychange', handleWindowAttention);
      stopWatchingPermission({
        watchedPermissionIdRef,
        recheckIntervalRef,
        recheckDeadlineRef,
        setWaitingPermissionId,
      });
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
      if (shouldWatchExternalGrantCompletion(permissionId, status)) {
        startWatchingPermission(permissionId);
      } else if (status?.granted === true && watchedPermissionIdRef.current === permissionId) {
        stopWatchingPermission({
          watchedPermissionIdRef,
          recheckIntervalRef,
          recheckDeadlineRef,
          setWaitingPermissionId,
        });
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
