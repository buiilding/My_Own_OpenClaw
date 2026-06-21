/**
 * Provides renderer-only dashboard layout event helpers.
 */

function getDefaultEventTarget() {
  return typeof window !== 'undefined' ? window : null;
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

export const DesktopDashboardLayoutRuntime = Object.freeze({
  requestDashboardLayoutPass,
});
