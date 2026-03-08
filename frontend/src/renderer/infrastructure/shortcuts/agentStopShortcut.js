export function getAgentStopShortcutLabel() {
  return 'Esc';
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
