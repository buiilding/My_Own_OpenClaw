/**
 * Coordinates browser interaction adapters for the response overlay surface.
 */

function resolveElement(elementRef) {
  if (elementRef && Object.prototype.hasOwnProperty.call(elementRef, 'current')) {
    return elementRef.current;
  }
  return elementRef || null;
}

function isPointerInsideResponsebox({ event, shellRef } = {}) {
  const shellBounds = resolveElement(shellRef)?.getBoundingClientRect?.();
  if (!shellBounds) {
    return false;
  }

  const pointerX = Number(event?.clientX);
  const pointerY = Number(event?.clientY);
  return (
    Number.isFinite(pointerX)
    && Number.isFinite(pointerY)
    && pointerX >= shellBounds.left
    && pointerX <= shellBounds.right
    && pointerY >= shellBounds.top
    && pointerY <= shellBounds.bottom
  );
}

function subscribeToResponseboxHitTestEvents({
  shellRef,
  onHitTestActiveChange,
  eventTarget = globalThis.window,
} = {}) {
  if (
    !eventTarget
    || typeof eventTarget.addEventListener !== 'function'
    || typeof eventTarget.removeEventListener !== 'function'
    || typeof onHitTestActiveChange !== 'function'
  ) {
    return () => {};
  }

  const syncHitTestForPointer = (event) => {
    onHitTestActiveChange(isPointerInsideResponsebox({ event, shellRef }));
  };
  const disableHitTest = () => {
    onHitTestActiveChange(false);
  };

  eventTarget.addEventListener('mousemove', syncHitTestForPointer);
  eventTarget.addEventListener('mouseleave', disableHitTest);
  eventTarget.addEventListener('blur', disableHitTest);

  return () => {
    eventTarget.removeEventListener('mousemove', syncHitTestForPointer);
    eventTarget.removeEventListener('mouseleave', disableHitTest);
    eventTarget.removeEventListener('blur', disableHitTest);
  };
}

export const DesktopResponseOverlayInteractionRuntime = Object.freeze({
  isPointerInsideResponsebox,
  subscribeToResponseboxHitTestEvents,
});
