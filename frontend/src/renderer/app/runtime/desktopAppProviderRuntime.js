/**
 * Coordinates browser adapters shared by renderer app providers.
 */

const EDITABLE_SHORTCUT_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]';

function resolveEventTarget(eventTarget = globalThis.window) {
  return eventTarget || {};
}

function hasMutableCurrentRef(ref) {
  return ref && Object.prototype.hasOwnProperty.call(ref, 'current');
}

function isEditableShortcutTarget(
  target,
  {
    elementCtor = globalThis.Element,
    htmlElementCtor = globalThis.HTMLElement,
  } = {},
) {
  if (typeof elementCtor !== 'function' || !(target instanceof elementCtor)) {
    return false;
  }
  if (target.closest?.(EDITABLE_SHORTCUT_SELECTOR)) {
    return true;
  }
  return typeof htmlElementCtor === 'function'
    && target instanceof htmlElementCtor
    && target.isContentEditable;
}

function subscribeToAppProviderKeyDown({
  onKeyDown,
  eventTarget = globalThis.window,
} = {}) {
  const target = resolveEventTarget(eventTarget);
  if (
    typeof onKeyDown !== 'function'
    || typeof target.addEventListener !== 'function'
    || typeof target.removeEventListener !== 'function'
  ) {
    return () => {};
  }

  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
}

function subscribeToAppConfigStorageEvents({
  onStorage,
  eventTarget = globalThis.window,
} = {}) {
  const target = resolveEventTarget(eventTarget);
  if (
    typeof onStorage !== 'function'
    || typeof target.addEventListener !== 'function'
    || typeof target.removeEventListener !== 'function'
  ) {
    return () => {};
  }

  target.addEventListener('storage', onStorage);
  return () => {
    target.removeEventListener('storage', onStorage);
  };
}

function getAppLocalStorage({
  windowApi = globalThis.window,
} = {}) {
  return windowApi?.localStorage;
}

function clearProviderTimer({
  timerRef,
  timerApi = globalThis,
} = {}) {
  if (!hasMutableCurrentRef(timerRef) || timerRef.current === null) {
    return false;
  }
  if (typeof timerApi?.clearTimeout === 'function') {
    timerApi.clearTimeout(timerRef.current);
  }
  timerRef.current = null;
  return true;
}

function scheduleProviderTimer({
  timerRef,
  callback,
  delayMs = 0,
  timerApi = globalThis,
} = {}) {
  if (!hasMutableCurrentRef(timerRef) || typeof callback !== 'function') {
    return null;
  }

  clearProviderTimer({ timerRef, timerApi });
  const runTimer = () => {
    timerRef.current = null;
    callback();
  };

  if (typeof timerApi?.setTimeout !== 'function') {
    runTimer();
    return null;
  }

  timerRef.current = timerApi.setTimeout(runTimer, delayMs);
  return timerRef.current;
}

export const DesktopAppProviderRuntime = Object.freeze({
  clearProviderTimer,
  getAppLocalStorage,
  isEditableShortcutTarget,
  scheduleProviderTimer,
  subscribeToAppConfigStorageEvents,
  subscribeToAppProviderKeyDown,
});
