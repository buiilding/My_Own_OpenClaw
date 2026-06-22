/**
 * Provides renderer-only dashboard layout event helpers.
 */

function getDefaultEventTarget() {
  return typeof window !== 'undefined' ? window : null;
}

function getDefaultDocument() {
  return typeof document !== 'undefined' ? document : null;
}

function requestDashboardLayoutPass(eventTarget = getDefaultEventTarget()) {
  if (!eventTarget?.dispatchEvent) {
    return false;
  }

  const dispatchResize = () => {
    eventTarget.dispatchEvent(new Event('resize'));
  };

  if (typeof eventTarget.requestAnimationFrame === 'function') {
    eventTarget.requestAnimationFrame(() => {
      dispatchResize();
      eventTarget.requestAnimationFrame(dispatchResize);
    });
    return true;
  }

  if (typeof eventTarget.setTimeout === 'function') {
    eventTarget.setTimeout(dispatchResize, 0);
    return true;
  }

  dispatchResize();
  return true;
}

function scheduleDashboardOpeningClear({
  onClear,
  delayMs = 0,
  timerApi = globalThis,
} = {}) {
  if (typeof onClear !== 'function') {
    return () => {};
  }
  if (
    typeof timerApi?.setTimeout !== 'function'
    || typeof timerApi?.clearTimeout !== 'function'
  ) {
    onClear();
    return () => {};
  }

  const timerId = timerApi.setTimeout(onClear, delayMs);
  return () => {
    timerApi.clearTimeout(timerId);
  };
}

function getDashboardScrollLockTargets({
  documentApi = getDefaultDocument(),
  rootId = 'root',
} = {}) {
  if (!documentApi) {
    return [];
  }

  return [
    documentApi.documentElement,
    documentApi.body,
    typeof documentApi.getElementById === 'function'
      ? documentApi.getElementById(rootId)
      : null,
  ].filter(Boolean);
}

function applyDashboardScrollLock({
  className,
  documentApi = getDefaultDocument(),
  rootId = 'root',
} = {}) {
  if (!className) {
    return () => {};
  }
  const targets = getDashboardScrollLockTargets({ documentApi, rootId });
  targets.forEach((target) => target.classList?.add?.(className));
  return () => {
    targets.forEach((target) => target.classList?.remove?.(className));
  };
}

export const DesktopDashboardLayoutRuntime = Object.freeze({
  applyDashboardScrollLock,
  getDashboardScrollLockTargets,
  requestDashboardLayoutPass,
  scheduleDashboardOpeningClear,
});
