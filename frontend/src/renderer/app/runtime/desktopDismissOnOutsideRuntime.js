/**
 * Provides shared renderer outside-dismiss browser event subscriptions.
 */

function resolveElement(containerRef) {
  if (containerRef && Object.prototype.hasOwnProperty.call(containerRef, 'current')) {
    return containerRef.current;
  }
  return containerRef || null;
}

function isOutsidePointerEvent(containerRef, event) {
  const container = resolveElement(containerRef);
  return Boolean(
    container
    && typeof container.contains === 'function'
    && !container.contains(event?.target),
  );
}

function isEscapeKeyEvent(event) {
  return event?.key === 'Escape';
}

function subscribeToDismissOnOutside({
  containerRef = null,
  onDismiss,
  eventTarget = globalThis.window,
  dismissOnPointerDown = true,
  dismissOnEscape = true,
} = {}) {
  if (
    typeof onDismiss !== 'function'
    || !eventTarget
    || typeof eventTarget.addEventListener !== 'function'
    || typeof eventTarget.removeEventListener !== 'function'
  ) {
    return () => {};
  }

  const handlePointerDown = (event) => {
    if (isOutsidePointerEvent(containerRef, event)) {
      onDismiss(event);
    }
  };

  const handleEscape = (event) => {
    if (isEscapeKeyEvent(event)) {
      onDismiss(event);
    }
  };

  if (dismissOnPointerDown) {
    eventTarget.addEventListener('mousedown', handlePointerDown);
  }
  if (dismissOnEscape) {
    eventTarget.addEventListener('keydown', handleEscape);
  }

  return () => {
    if (dismissOnPointerDown) {
      eventTarget.removeEventListener('mousedown', handlePointerDown);
    }
    if (dismissOnEscape) {
      eventTarget.removeEventListener('keydown', handleEscape);
    }
  };
}

export const DesktopDismissOnOutsideRuntime = Object.freeze({
  isEscapeKeyEvent,
  isOutsidePointerEvent,
  subscribeToDismissOnOutside,
});
