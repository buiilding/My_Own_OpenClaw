function isMacPlatform() {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const platform = String(navigator.platform || '').toLowerCase();
  const userAgent = String(navigator.userAgent || '').toLowerCase();
  return platform.includes('mac') || userAgent.includes('mac os');
}

export function getAgentStopShortcutLabel() {
  return isMacPlatform() ? 'Command + Option + .' : 'Ctrl + Alt + .';
}

export function isAgentStopShortcutEvent(event) {
  if (!event || typeof event !== 'object') {
    return false;
  }
  if (event.repeat) {
    return false;
  }
  if (!event.altKey || event.shiftKey) {
    return false;
  }

  const key = String(event.key || '');
  const code = String(event.code || '');
  const periodPressed = key === '.' || code === 'Period';
  if (!periodPressed) {
    return false;
  }

  if (isMacPlatform()) {
    return event.metaKey && !event.ctrlKey;
  }
  return event.ctrlKey && !event.metaKey;
}
