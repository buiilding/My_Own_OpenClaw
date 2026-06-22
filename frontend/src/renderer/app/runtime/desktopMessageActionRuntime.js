/**
 * Coordinates browser timer adapters for chat message action controls.
 */

function resolveWindowApi(windowApi = globalThis.window) {
  return windowApi || {};
}

function hasMutableCurrentRef(ref) {
  return ref && Object.prototype.hasOwnProperty.call(ref, 'current');
}

function clearMessageActionTimer({
  timerRef,
  windowApi = globalThis.window,
} = {}) {
  if (!hasMutableCurrentRef(timerRef) || timerRef.current === null) {
    return false;
  }

  const browserApi = resolveWindowApi(windowApi);
  if (typeof browserApi.clearTimeout === 'function') {
    browserApi.clearTimeout(timerRef.current);
  }
  timerRef.current = null;
  return true;
}

function scheduleMessageActionTimer({
  timerRef,
  callback,
  delayMs = 0,
  windowApi = globalThis.window,
} = {}) {
  if (!hasMutableCurrentRef(timerRef) || typeof callback !== 'function') {
    return null;
  }

  clearMessageActionTimer({ timerRef, windowApi });
  const browserApi = resolveWindowApi(windowApi);
  const runTimer = () => {
    timerRef.current = null;
    callback();
  };

  if (typeof browserApi.setTimeout !== 'function') {
    runTimer();
    return null;
  }

  timerRef.current = browserApi.setTimeout(runTimer, delayMs);
  return timerRef.current;
}

export const DesktopMessageActionRuntime = Object.freeze({
  clearMessageActionTimer,
  scheduleMessageActionTimer,
});
