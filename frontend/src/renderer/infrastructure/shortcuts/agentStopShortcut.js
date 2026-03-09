export function getAgentStopShortcutLabel() {
  return 'Esc';
}

function getRendererPlatformLabel() {
  if (typeof navigator !== 'object' || navigator == null) {
    return '';
  }
  const userAgentDataPlatform = navigator.userAgentData?.platform;
  if (typeof userAgentDataPlatform === 'string' && userAgentDataPlatform.trim()) {
    return userAgentDataPlatform;
  }
  const navigatorPlatform = navigator.platform;
  if (typeof navigatorPlatform === 'string' && navigatorPlatform.trim()) {
    return navigatorPlatform;
  }
  return '';
}

export function getGlobalAgentStopShortcutLabel() {
  return /mac/i.test(getRendererPlatformLabel())
    ? 'Command + Shift + Esc'
    : 'Ctrl + Shift + Esc';
}

export function isAgentStopShortcutEvent(event) {
  if (!event || typeof event !== 'object') {
    return false;
  }
  if (event.repeat) {
    return false;
  }
  const key = String(event.key || '');
  const normalizedKey = key.toLowerCase();
  if (normalizedKey !== 'escape' && normalizedKey !== 'esc') {
    return false;
  }
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}
