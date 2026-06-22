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

function resetChatboxVisualAnchorHeight() {
  return DesktopWindowRuntimeClient
    .setChatboxVisualAnchorHeightValue(
      DesktopChatboxLayoutRuntime.resolveChatboxVisualAnchorHeight(),
    )
    .catch(() => {});
}

export const DesktopChatboxInteractionRuntime = Object.freeze({
  isPointerInsideChatbox,
  resetChatboxVisualAnchorHeight,
  startChatboxVisualAnchorSync,
  subscribeToChatboxDragWindowEvents,
  subscribeToChatboxHitTestEvents,
});
