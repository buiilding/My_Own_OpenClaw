/**
 * Provides browser lifecycle adapters for the dashboard search modal.
 */

function resolveElement(elementRef) {
  if (elementRef && Object.prototype.hasOwnProperty.call(elementRef, 'current')) {
    return elementRef.current;
  }
  return elementRef || null;
}

function focusElement(elementRef) {
  const element = resolveElement(elementRef);
  if (element && typeof element.focus === 'function') {
    element.focus();
  }
}

function scheduleFocus({
  inputRef,
  timerApi,
  focusDelayMs,
}) {
  if (!timerApi || typeof timerApi.setTimeout !== 'function') {
    focusElement(inputRef);
    return null;
  }
  return timerApi.setTimeout(() => {
    focusElement(inputRef);
  }, focusDelayMs);
}

function clearScheduledFocus(timerApi, timerId) {
  if (timerId == null || !timerApi || typeof timerApi.clearTimeout !== 'function') {
    return;
  }
  timerApi.clearTimeout(timerId);
}

function subscribeToEscapeClose({
  eventTarget,
  onClose,
}) {
  if (
    !eventTarget
    || typeof eventTarget.addEventListener !== 'function'
    || typeof eventTarget.removeEventListener !== 'function'
    || typeof onClose !== 'function'
  ) {
    return () => {};
  }

  const handleKeyDown = (event) => {
    if (event?.key === 'Escape') {
      onClose(event);
    }
  };

  eventTarget.addEventListener('keydown', handleKeyDown);
  return () => {
    eventTarget.removeEventListener('keydown', handleKeyDown);
  };
}

function startSearchModalLifecycle({
  inputRef,
  onClose,
  eventTarget = globalThis.window,
  timerApi = globalThis.window,
  focusDelayMs = 20,
} = {}) {
  const timerId = scheduleFocus({
    inputRef,
    timerApi,
    focusDelayMs,
  });
  const unsubscribeEscape = subscribeToEscapeClose({
    eventTarget,
    onClose,
  });

  return () => {
    clearScheduledFocus(timerApi, timerId);
    unsubscribeEscape();
  };
}

export const DesktopDashboardSearchModalRuntime = Object.freeze({
  startSearchModalLifecycle,
});
