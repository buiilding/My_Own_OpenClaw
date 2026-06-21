/**
 * Coordinates renderer permission post-grant effects shared by onboarding and settings UI.
 */

const PERMISSION_RECHECK_INTERVAL_MS = 1000;
const PERMISSION_RECHECK_TIMEOUT_MS = 2 * 60 * 1000;

const EXTERNAL_GRANT_WATCH_PERMISSION_IDS = new Set([
  'screen_capture',
  'input_control_accessibility',
  'system_events_automation',
  'microphone',
]);

function applyPermissionGrantEffects({ permissionId, status, updateConfig }) {
  if (
    permissionId === 'browser_automation'
    && status?.granted === true
    && typeof updateConfig === 'function'
  ) {
    updateConfig({ browser_automation_enabled: true });
  }
}

function shouldPollPermissionGrantByInterval(permissionId) {
  return EXTERNAL_GRANT_WATCH_PERMISSION_IDS.has(permissionId);
}

function shouldWatchExternalPermissionGrantCompletion(permissionId, status) {
  if (permissionId === 'screen_capture' && status?.details?.media_status === 'granted') {
    return false;
  }
  return (
    shouldPollPermissionGrantByInterval(permissionId)
    && status?.granted !== true
    && status?.status === 'needs-action'
  );
}

function isPermissionGrantComplete(status) {
  return status?.granted === true || status?.status === 'granted';
}

function getRendererWindow() {
  return typeof window === 'undefined' ? null : window;
}

function getRendererDocument() {
  return typeof document === 'undefined' ? null : document;
}

function createExternalPermissionGrantWatcher({
  runPermissionProbe,
  setWaitingPermissionId,
  windowTarget = getRendererWindow(),
  documentTarget = getRendererDocument(),
  now = () => Date.now(),
} = {}) {
  let watchedPermissionId = '';
  let recheckDeadline = 0;
  let recheckIntervalId = null;

  const setWaiting = (permissionId) => {
    if (typeof setWaitingPermissionId === 'function') {
      setWaitingPermissionId(permissionId);
    }
  };

  const clearRecheckInterval = () => {
    if (recheckIntervalId && typeof windowTarget?.clearInterval === 'function') {
      windowTarget.clearInterval(recheckIntervalId);
    }
    recheckIntervalId = null;
  };

  const stop = (permissionId = '') => {
    if (permissionId && watchedPermissionId !== permissionId) {
      return;
    }
    const hadActiveWatcher = Boolean(watchedPermissionId || recheckDeadline || recheckIntervalId);
    watchedPermissionId = '';
    recheckDeadline = 0;
    if (hadActiveWatcher) {
      setWaiting('');
    }
    clearRecheckInterval();
  };

  const recheck = async () => {
    const permissionId = watchedPermissionId;
    if (!permissionId) {
      return null;
    }

    const status = typeof runPermissionProbe === 'function'
      ? await runPermissionProbe(permissionId)
      : null;
    if (isPermissionGrantComplete(status) || now() >= recheckDeadline) {
      stop();
    }
    return status;
  };

  const start = (permissionId) => {
    if (!permissionId || !windowTarget) {
      return;
    }

    const shouldPollByInterval = shouldPollPermissionGrantByInterval(permissionId);
    stop();
    watchedPermissionId = permissionId;
    recheckDeadline = now() + PERMISSION_RECHECK_TIMEOUT_MS;
    setWaiting(permissionId);

    if (shouldPollByInterval && typeof windowTarget.setInterval === 'function') {
      recheckIntervalId = windowTarget.setInterval(() => {
        void recheck();
      }, PERMISSION_RECHECK_INTERVAL_MS);
      void recheck();
    }
  };

  const stopWhenGrantComplete = (permissionId, status) => {
    if (isPermissionGrantComplete(status)) {
      stop(permissionId);
    }
  };

  const handleRendererAttention = () => {
    if (documentTarget?.hidden || !watchedPermissionId) {
      return;
    }
    void recheck();
  };

  if (typeof windowTarget?.addEventListener === 'function') {
    windowTarget.addEventListener('focus', handleRendererAttention);
  }
  if (typeof documentTarget?.addEventListener === 'function') {
    documentTarget.addEventListener('visibilitychange', handleRendererAttention);
  }

  const dispose = () => {
    if (typeof windowTarget?.removeEventListener === 'function') {
      windowTarget.removeEventListener('focus', handleRendererAttention);
    }
    if (typeof documentTarget?.removeEventListener === 'function') {
      documentTarget.removeEventListener('visibilitychange', handleRendererAttention);
    }
    stop();
  };

  return Object.freeze({
    dispose,
    getWatchedPermissionId: () => watchedPermissionId,
    recheck,
    start,
    stop,
    stopWhenGrantComplete,
  });
}

export const DesktopPermissionGrantEffectsRuntime = Object.freeze({
  applyPermissionGrantEffects,
  createExternalPermissionGrantWatcher,
  shouldPollPermissionGrantByInterval,
  shouldWatchExternalPermissionGrantCompletion,
});
