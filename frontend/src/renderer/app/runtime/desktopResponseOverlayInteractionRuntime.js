/**
 * Coordinates browser interaction adapters for the response overlay surface.
 */

function resolveElement(elementRef) {
  if (elementRef && Object.prototype.hasOwnProperty.call(elementRef, 'current')) {
    return elementRef.current;
  }
  return elementRef || null;
}

function resolveWindowApi(windowApi = globalThis.window) {
  return windowApi || {};
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

function scheduleResponseOverlayFrame({
  callback,
  windowApi = globalThis.window,
} = {}) {
  if (typeof callback !== 'function') {
    return () => {};
  }

  const browserApi = resolveWindowApi(windowApi);
  let cancelled = false;
  let frameId = null;
  const run = () => {
    frameId = null;
    if (!cancelled) {
      callback();
    }
  };

  if (typeof browserApi.requestAnimationFrame !== 'function') {
    run();
    return () => {
      cancelled = true;
    };
  }

  frameId = browserApi.requestAnimationFrame(run);
  return () => {
    cancelled = true;
    if (frameId !== null && typeof browserApi.cancelAnimationFrame === 'function') {
      browserApi.cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
}

function startResponseOverlaySizeUpdateSync({
  shellRef,
  onSizeUpdate,
  resizeObserverCtor = globalThis.ResizeObserver,
  retryDelayMs = 40,
  windowApi = globalThis.window,
} = {}) {
  if (typeof onSizeUpdate !== 'function') {
    return () => {};
  }

  const browserApi = resolveWindowApi(windowApi);
  let cancelled = false;
  let frameId = null;
  let retryTimerId = null;

  const scheduleSizeUpdate = () => {
    if (cancelled) {
      return;
    }
    if (frameId !== null && typeof browserApi.cancelAnimationFrame === 'function') {
      browserApi.cancelAnimationFrame(frameId);
    }
    const runUpdate = () => {
      frameId = null;
      if (!cancelled) {
        onSizeUpdate();
      }
    };
    if (typeof browserApi.requestAnimationFrame !== 'function') {
      runUpdate();
      return;
    }
    frameId = browserApi.requestAnimationFrame(runUpdate);
  };

  scheduleSizeUpdate();

  if (typeof browserApi.setTimeout === 'function') {
    retryTimerId = browserApi.setTimeout(scheduleSizeUpdate, retryDelayMs);
  }

  const shellElement = resolveElement(shellRef);
  const resizeObserver = typeof resizeObserverCtor === 'function' && shellElement
    ? new resizeObserverCtor(scheduleSizeUpdate)
    : null;
  resizeObserver?.observe?.(shellElement);

  return () => {
    cancelled = true;
    if (frameId !== null && typeof browserApi.cancelAnimationFrame === 'function') {
      browserApi.cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (retryTimerId !== null && typeof browserApi.clearTimeout === 'function') {
      browserApi.clearTimeout(retryTimerId);
      retryTimerId = null;
    }
    resizeObserver?.disconnect?.();
  };
}

export const DesktopResponseOverlayInteractionRuntime = Object.freeze({
  isPointerInsideResponsebox,
  scheduleResponseOverlayFrame,
  startResponseOverlaySizeUpdateSync,
  subscribeToResponseboxHitTestEvents,
});
