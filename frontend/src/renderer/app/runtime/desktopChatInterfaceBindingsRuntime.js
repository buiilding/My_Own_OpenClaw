/**
 * Provides shared browser-event subscriptions for the chat interface surface.
 */

import { DesktopShortcutRuntimeClient } from './desktopShortcutRuntimeClient';

function resolveElement(containerRef) {
  if (containerRef && Object.prototype.hasOwnProperty.call(containerRef, 'current')) {
    return containerRef.current;
  }
  return containerRef || null;
}

function isOutsideRef(containerRef, target) {
  const container = resolveElement(containerRef);
  return Boolean(
    container
    && typeof container.contains === 'function'
    && !container.contains(target),
  );
}

function subscribeToEvent(eventTarget, eventName, listener) {
  if (
    !eventTarget
    || typeof eventTarget.addEventListener !== 'function'
    || typeof eventTarget.removeEventListener !== 'function'
  ) {
    return () => {};
  }
  eventTarget.addEventListener(eventName, listener);
  return () => {
    eventTarget.removeEventListener(eventName, listener);
  };
}

function subscribeToMenuDismiss({
  menus = [],
  eventTarget = globalThis.window,
} = {}) {
  const menuItems = Array.isArray(menus)
    ? menus.filter((menu) => menu && typeof menu.dismiss === 'function')
    : [];
  if (menuItems.length === 0) {
    return () => {};
  }

  return subscribeToEvent(eventTarget, 'mousedown', (event) => {
    for (const menu of menuItems) {
      if (isOutsideRef(menu.ref, event?.target)) {
        menu.dismiss(event);
      }
    }
  });
}

function preventHandledShortcutEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation();
  }
}

function subscribeToStopShortcut({
  canStop = false,
  onStop,
  eventTarget = globalThis.window,
} = {}) {
  if (typeof onStop !== 'function') {
    return () => {};
  }

  return subscribeToEvent(eventTarget, 'keydown', (event) => {
    if (!canStop || !DesktopShortcutRuntimeClient.isAgentStopShortcutEvent(event)) {
      return;
    }
    preventHandledShortcutEvent(event);
    onStop(event);
  });
}

function subscribeToWindowFocus({
  onFocus,
  eventTarget = globalThis.window,
} = {}) {
  if (typeof onFocus !== 'function') {
    return () => {};
  }

  return subscribeToEvent(eventTarget, 'focus', onFocus);
}

function scheduleDeferredFocus({
  focus,
  animationFrameApi = globalThis.window,
} = {}) {
  if (typeof focus !== 'function') {
    return () => {};
  }

  if (typeof animationFrameApi?.requestAnimationFrame !== 'function') {
    focus();
    return () => {};
  }

  const frameId = animationFrameApi.requestAnimationFrame(focus);
  return () => {
    if (typeof animationFrameApi.cancelAnimationFrame === 'function') {
      animationFrameApi.cancelAnimationFrame(frameId);
    }
  };
}

function isOpenFindShortcutEvent(event) {
  if (event?.defaultPrevented) {
    return false;
  }
  const lowerKey = typeof event?.key === 'string' ? event.key.toLowerCase() : '';
  return (event.metaKey || event.ctrlKey) && lowerKey === 'f' && !event.altKey;
}

function subscribeToFindShortcut({
  isFindOpen = false,
  onOpenFind,
  onCloseFind,
  eventTarget = globalThis.window,
} = {}) {
  if (typeof onOpenFind !== 'function' && typeof onCloseFind !== 'function') {
    return () => {};
  }

  return subscribeToEvent(eventTarget, 'keydown', (event) => {
    if (isOpenFindShortcutEvent(event)) {
      preventHandledShortcutEvent(event);
      onOpenFind?.(event);
      return;
    }

    if (event?.key === 'Escape' && isFindOpen && typeof onCloseFind === 'function') {
      event.preventDefault();
      onCloseFind(event);
    }
  });
}

export const DesktopChatInterfaceBindingsRuntime = Object.freeze({
  scheduleDeferredFocus,
  subscribeToFindShortcut,
  subscribeToMenuDismiss,
  subscribeToStopShortcut,
  subscribeToWindowFocus,
});
