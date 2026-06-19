/**
 * Provides renderer-only desktop chat event helpers.
 */

export const DESKTOP_RUNTIME_NEW_CHAT_EVENT = 'desktop-runtime:new-chat';

function getDefaultEventTarget() {
  return typeof window !== 'undefined' ? window : null;
}

export function dispatchDesktopRuntimeNewChatEvent(eventTarget = getDefaultEventTarget()) {
  if (!eventTarget?.dispatchEvent) {
    return false;
  }
  eventTarget.dispatchEvent(new Event(DESKTOP_RUNTIME_NEW_CHAT_EVENT));
  return true;
}

export function subscribeDesktopRuntimeNewChatEvent(
  listener,
  eventTarget = getDefaultEventTarget(),
) {
  if (!eventTarget?.addEventListener || !eventTarget?.removeEventListener) {
    return () => {};
  }
  const handleNewChatEvent = () => {
    listener();
  };
  eventTarget.addEventListener(DESKTOP_RUNTIME_NEW_CHAT_EVENT, handleNewChatEvent);
  return () => {
    eventTarget.removeEventListener(DESKTOP_RUNTIME_NEW_CHAT_EVENT, handleNewChatEvent);
  };
}
