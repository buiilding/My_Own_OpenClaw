/**
 * Coordinates browser interaction adapters for the minimal chatbox surface.
 */

import { DesktopWindowRuntimeClient } from './desktopWindowRuntimeClient';
import { DesktopChatboxLayoutRuntime } from './desktopChatboxLayoutRuntime';

const CHATBOX_VISUAL_ANCHOR_RESIZE_SETTLE_MS = 120;

function resolveElement(elementRef) {
  if (elementRef && Object.prototype.hasOwnProperty.call(elementRef, 'current')) {
    return elementRef.current;
  }
  return elementRef || null;
}

function resolveWindowApi(windowApi = globalThis.window) {
  return windowApi || {};
}

function subscribeToChatboxDragWindowEvents({
  onDragMove,
  onStopDragging,
  eventTarget = globalThis.window,
} = {}) {
  if (
    !eventTarget
    || typeof eventTarget.addEventListener !== 'function'
    || typeof eventTarget.removeEventListener !== 'function'
  ) {
    return () => {};
  }

  eventTarget.addEventListener('pointermove', onDragMove);
  eventTarget.addEventListener('pointerup', onStopDragging);
  eventTarget.addEventListener('mousemove', onDragMove);
  eventTarget.addEventListener('mouseup', onStopDragging);
  eventTarget.addEventListener('blur', onStopDragging);

  return () => {
    eventTarget.removeEventListener('pointermove', onDragMove);
    eventTarget.removeEventListener('pointerup', onStopDragging);
    eventTarget.removeEventListener('mousemove', onDragMove);
    eventTarget.removeEventListener('mouseup', onStopDragging);
    eventTarget.removeEventListener('blur', onStopDragging);
  };
}

function isPointerInsideChatbox({ event, pillRef } = {}) {
  const pillBounds = resolveElement(pillRef)?.getBoundingClientRect?.();
  if (!pillBounds) {
    return false;
  }

  const pointerX = Number(event?.clientX);
  const pointerY = Number(event?.clientY);
  return (
    Number.isFinite(pointerX)
    && Number.isFinite(pointerY)
    && pointerX >= pillBounds.left
    && pointerX <= pillBounds.right
    && pointerY >= pillBounds.top
    && pointerY <= pillBounds.bottom
  );
}

function subscribeToChatboxHitTestEvents({
  pillRef,
  onHitTestActiveChange,
  onTextEntryBlur,
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
    onHitTestActiveChange(isPointerInsideChatbox({ event, pillRef }));
  };
  const disableHitTest = () => {
    onHitTestActiveChange(false);
  };
  const handleBlur = () => {
    disableHitTest();
    onTextEntryBlur?.();
  };

  eventTarget.addEventListener('mousemove', syncHitTestForPointer);
  eventTarget.addEventListener('mouseleave', disableHitTest);
  eventTarget.addEventListener('blur', handleBlur);

  return () => {
    eventTarget.removeEventListener('mousemove', syncHitTestForPointer);
    eventTarget.removeEventListener('mouseleave', disableHitTest);
    eventTarget.removeEventListener('blur', handleBlur);
  };
}

function resolveChatboxCloseButtonAnchorCenterX({
  pillRef,
  sendButtonRef,
} = {}) {
  const pillElement = resolveElement(pillRef);
  const sendButtonElement = resolveElement(sendButtonRef);
  if (!pillElement || !sendButtonElement) {
    return null;
  }

  const pillRect = pillElement.getBoundingClientRect?.();
  const sendRect = sendButtonElement.getBoundingClientRect?.();
  if (!pillRect || !sendRect || pillRect.width <= 0 || sendRect.width <= 0) {
    return null;
  }

  const pillWidth = Math.max(
    Math.round(Number(pillElement.offsetWidth) || 0),
    Math.round(Number(pillRect.width) || 0),
  );
  if (pillWidth <= 0) {
    return null;
  }

  return Math.round((sendRect.left - pillRect.left) + (sendRect.width / 2));
}

function resolveMutableSnapshot(snapshotRef) {
  if (snapshotRef && Object.prototype.hasOwnProperty.call(snapshotRef, 'current')) {
    return snapshotRef.current;
  }
  return snapshotRef || null;
}

function syncChatboxCloseButtonAnchor({
  pillRef,
  sendButtonRef,
  snapshotRef,
} = {}) {
  const pillElement = resolveElement(pillRef);
  const centerX = resolveChatboxCloseButtonAnchorCenterX({
    pillRef,
    sendButtonRef,
  });
  if (!pillElement || centerX === null) {
    return null;
  }

  const snapshot = resolveMutableSnapshot(snapshotRef);
  if (snapshot?.centerX === centerX) {
    return centerX;
  }

  pillElement.style?.setProperty?.('--chatbox-close-center-x', `${centerX}px`);
  if (snapshot) {
    snapshot.centerX = centerX;
  }
  return centerX;
}

function startChatboxCloseButtonAnchorSync({
  pillRef,
  sendButtonRef,
  snapshotRef,
  resizeObserverCtor = globalThis.ResizeObserver,
  windowApi = globalThis.window,
} = {}) {
  const browserApi = resolveWindowApi(windowApi);
  let scheduledFrame = null;

  const syncAnchor = () => {
    scheduledFrame = null;
    syncChatboxCloseButtonAnchor({
      pillRef,
      sendButtonRef,
      snapshotRef,
    });
  };

  const scheduleAnchorSync = () => {
    if (typeof browserApi.requestAnimationFrame !== 'function') {
      syncAnchor();
      return;
    }
    if (scheduledFrame !== null && typeof browserApi.cancelAnimationFrame === 'function') {
      browserApi.cancelAnimationFrame(scheduledFrame);
    }
    scheduledFrame = browserApi.requestAnimationFrame(syncAnchor);
  };

  scheduleAnchorSync();

  const canListenForResize = (
    typeof browserApi.addEventListener === 'function'
    && typeof browserApi.removeEventListener === 'function'
  );
  if (canListenForResize) {
    browserApi.addEventListener('resize', scheduleAnchorSync);
  }

  const pillElement = resolveElement(pillRef);
  const resizeObserver = typeof resizeObserverCtor === 'function' && pillElement
    ? new resizeObserverCtor(scheduleAnchorSync)
    : null;
  resizeObserver?.observe?.(pillElement);

  return () => {
    if (canListenForResize) {
      browserApi.removeEventListener('resize', scheduleAnchorSync);
    }
    if (scheduledFrame !== null && typeof browserApi.cancelAnimationFrame === 'function') {
      browserApi.cancelAnimationFrame(scheduledFrame);
      scheduledFrame = null;
    }
    resizeObserver?.disconnect?.();
  };
}

function scheduleAnimationFrameCommit({
  animationFrameApi,
  commit,
  getCancelled,
  scheduledFrame,
  setScheduledFrame,
}) {
  if (typeof animationFrameApi.requestAnimationFrame !== 'function') {
    commit();
    return;
  }
  if (scheduledFrame !== null && typeof animationFrameApi.cancelAnimationFrame === 'function') {
    animationFrameApi.cancelAnimationFrame(scheduledFrame);
  }
  const nextFrame = animationFrameApi.requestAnimationFrame(() => {
    setScheduledFrame(null);
    if (!getCancelled()) {
      commit();
    }
  });
  setScheduledFrame(nextFrame);
}

function startChatboxVisualAnchorSync({
  shellRef,
  hasImagePreview,
  frameHeight = null,
  anchorHeightOverride = null,
  resizeObserverCtor = globalThis.ResizeObserver,
  windowApi = globalThis.window,
  onError = (error) => console.warn('[MinimalChatPill] Failed to sync visual anchor height:', error),
} = {}) {
  const browserApi = resolveWindowApi(windowApi);
  let cancelled = false;
  let lastReportedSignature = null;
  let scheduledFrame = null;
  let scheduledTimeout = null;
  const shellElement = resolveElement(shellRef);

  const commitAnchorHeight = () => {
    scheduledFrame = null;
    const overrideAnchorHeight = Math.round(Number(anchorHeightOverride));
    const nextAnchorHeight = Number.isFinite(overrideAnchorHeight) && overrideAnchorHeight > 0
      ? overrideAnchorHeight
      : DesktopChatboxLayoutRuntime.resolveChatboxVisualAnchorHeight({
        hasImagePreview,
        shellHeight: shellElement?.offsetHeight ?? null,
      });
    const nextFrameHeight = Math.round(Number(frameHeight));
    const normalizedFrameHeight = Number.isFinite(nextFrameHeight) && nextFrameHeight > 0
      ? nextFrameHeight
      : null;
    const nextSignature = `${nextAnchorHeight}:${normalizedFrameHeight || ''}`;
    if (nextSignature === lastReportedSignature) {
      return;
    }
    lastReportedSignature = nextSignature;
    DesktopWindowRuntimeClient
      .setChatboxVisualAnchorHeightValue(nextAnchorHeight, normalizedFrameHeight)
      .catch((error) => {
        if (!cancelled) {
          onError?.(error);
        }
      });
  };

  const scheduleAnchorHeightReport = () => {
    if (cancelled) {
      return;
    }

    const queueCommit = () => {
      scheduleAnimationFrameCommit({
        animationFrameApi: browserApi,
        commit: commitAnchorHeight,
        getCancelled: () => cancelled,
        scheduledFrame,
        setScheduledFrame: (frameId) => {
          scheduledFrame = frameId;
        },
      });
    };

    if (CHATBOX_VISUAL_ANCHOR_RESIZE_SETTLE_MS <= 0 || typeof browserApi.setTimeout !== 'function') {
      queueCommit();
      return;
    }

    if (scheduledTimeout !== null && typeof browserApi.clearTimeout === 'function') {
      browserApi.clearTimeout(scheduledTimeout);
    }
    scheduledTimeout = browserApi.setTimeout(() => {
      scheduledTimeout = null;
      queueCommit();
    }, CHATBOX_VISUAL_ANCHOR_RESIZE_SETTLE_MS);
  };

  const cleanupScheduledWork = () => {
    if (scheduledTimeout !== null && typeof browserApi.clearTimeout === 'function') {
      browserApi.clearTimeout(scheduledTimeout);
      scheduledTimeout = null;
    }
    if (scheduledFrame !== null && typeof browserApi.cancelAnimationFrame === 'function') {
      browserApi.cancelAnimationFrame(scheduledFrame);
      scheduledFrame = null;
    }
  };

  commitAnchorHeight();

  if (!shellElement || typeof resizeObserverCtor !== 'function') {
    return () => {
      cancelled = true;
      cleanupScheduledWork();
    };
  }

  const resizeObserver = new resizeObserverCtor(() => {
    scheduleAnchorHeightReport();
  });
  resizeObserver.observe(shellElement);

  return () => {
    cancelled = true;
    cleanupScheduledWork();
    resizeObserver.disconnect();
  };
}

function hasMutableCurrentRef(ref) {
  return ref && Object.prototype.hasOwnProperty.call(ref, 'current');
}

function focusChatboxTextInputAtEnd(inputRef) {
  const input = resolveElement(inputRef);
  if (!input || typeof input.focus !== 'function') {
    return false;
  }

  input.focus();
  const textLength = typeof input.value === 'string' ? input.value.length : 0;
  input.setSelectionRange?.(textLength, textLength);
  return true;
}

function clearChatboxNativeFrameCollapse({
  timeoutRef,
  windowApi = globalThis.window,
} = {}) {
  if (!hasMutableCurrentRef(timeoutRef) || timeoutRef.current === null) {
    return false;
  }
  const browserApi = resolveWindowApi(windowApi);
  if (typeof browserApi.clearTimeout === 'function') {
    browserApi.clearTimeout(timeoutRef.current);
  }
  timeoutRef.current = null;
  return true;
}

function scheduleChatboxNativeFrameCollapse({
  timeoutRef,
  callback,
  delayMs = 0,
  windowApi = globalThis.window,
} = {}) {
  if (!hasMutableCurrentRef(timeoutRef) || typeof callback !== 'function') {
    return null;
  }

  clearChatboxNativeFrameCollapse({ timeoutRef, windowApi });
  const browserApi = resolveWindowApi(windowApi);
  const runCollapse = () => {
    timeoutRef.current = null;
    callback();
  };

  if (typeof browserApi.setTimeout !== 'function') {
    runCollapse();
    return null;
  }

  timeoutRef.current = browserApi.setTimeout(runCollapse, delayMs);
  return timeoutRef.current;
}

function scheduleChatboxComposerHeightCommit({
  sequenceRef,
  sequence,
  height,
  applyComposerHeight,
  windowApi = globalThis.window,
} = {}) {
  if (
    !hasMutableCurrentRef(sequenceRef)
    || sequenceRef.current !== sequence
    || typeof applyComposerHeight !== 'function'
  ) {
    return null;
  }

  const browserApi = resolveWindowApi(windowApi);
  const commitHeight = () => {
    if (sequenceRef.current === sequence) {
      applyComposerHeight(height);
    }
  };

  if (typeof browserApi.requestAnimationFrame !== 'function') {
    commitHeight();
    return null;
  }

  return browserApi.requestAnimationFrame(commitHeight);
}

function resetChatboxVisualAnchorHeight() {
  return DesktopWindowRuntimeClient
    .setChatboxVisualAnchorHeightValue(
      DesktopChatboxLayoutRuntime.resolveChatboxVisualAnchorHeight(),
    )
    .catch(() => {});
}

export const DesktopChatboxInteractionRuntime = Object.freeze({
  clearChatboxNativeFrameCollapse,
  focusChatboxTextInputAtEnd,
  isPointerInsideChatbox,
  resolveChatboxCloseButtonAnchorCenterX,
  resetChatboxVisualAnchorHeight,
  scheduleChatboxComposerHeightCommit,
  scheduleChatboxNativeFrameCollapse,
  startChatboxVisualAnchorSync,
  startChatboxCloseButtonAnchorSync,
  subscribeToChatboxDragWindowEvents,
  subscribeToChatboxHitTestEvents,
});
