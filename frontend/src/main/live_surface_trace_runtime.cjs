function isLiveSurfaceTraceEnabled() {
  return (
    process.env.WINDIE_DEBUG_LIVE_SURFACE === '1'
    || process.env.WINDIE_DEV_UI === '1'
    || process.env.WINDIE_DEBUG_CHAT_PILL === '1'
    || process.env.WINDIE_DEBUG_STREAM_EVENTS === '1'
  );
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function safeWindowVisible(win) {
  if (!win || typeof win !== 'object') {
    return null;
  }
  try {
    if (typeof win.isDestroyed === 'function' && win.isDestroyed()) {
      return null;
    }
    return typeof win.isVisible === 'function' ? Boolean(win.isVisible()) : null;
  } catch (_error) {
    return null;
  }
}

function safeWindowDestroyed(win) {
  if (!win || typeof win !== 'object' || typeof win.isDestroyed !== 'function') {
    return null;
  }
  try {
    return Boolean(win.isDestroyed());
  } catch (_error) {
    return null;
  }
}

function summarizeWindow(win, label) {
  if (!win) {
    return null;
  }
  return {
    label,
    visible: safeWindowVisible(win),
    destroyed: safeWindowDestroyed(win),
  };
}

function countEntries(presentation) {
  return Array.isArray(presentation?.entries) ? presentation.entries.length : 0;
}

function countToolEvents(currentTurn) {
  return Array.isArray(currentTurn?.toolEvents) ? currentTurn.toolEvents.length : 0;
}

function summarizeCurrentTurn(currentTurn) {
  const presentation = currentTurn?.presentation || null;
  const overlayIntent = presentation?.overlayIntent || null;
  return {
    turnRef: normalizeString(currentTurn?.turnRef),
    conversationRef: normalizeString(currentTurn?.conversationRef)
      || normalizeString(presentation?.conversationRef)
      || normalizeString(overlayIntent?.conversationRef),
    phase: normalizeString(currentTurn?.phase) || normalizeString(presentation?.phase),
    overlayMode: normalizeString(overlayIntent?.mode),
    guardRef: normalizeString(overlayIntent?.staleGuardRef)
      || normalizeString(overlayIntent?.turnRef)
      || normalizeString(currentTurn?.turnRef),
    typingVisible: presentation?.typingVisible === true,
    overlayVisible: presentation?.overlayVisible === true,
    isBusy: presentation?.isBusy === true,
    isTerminal: presentation?.isTerminal === true,
    hasVisibleContent: presentation?.hasVisibleContent === true,
    entryCount: countEntries(presentation),
    assistantLength: typeof currentTurn?.assistantText === 'string'
      ? currentTurn.assistantText.length
      : 0,
    reasoningLength: typeof currentTurn?.reasoningText === 'string'
      ? currentTurn.reasoningText.length
      : 0,
    toolEventCount: countToolEvents(currentTurn),
  };
}

function cleanupPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function logLiveSurfaceTrace(event, payload = {}, {
  processName = 'main',
  log = console.log,
} = {}) {
  if (!isLiveSurfaceTraceEnabled()) {
    return;
  }
  const normalizedEvent = normalizeString(event) || 'unknown';
  log('[LiveSurfaceTrace]', cleanupPayload({
    ts: new Date().toISOString(),
    process: processName,
    event: normalizedEvent,
    ...payload,
  }));
}

module.exports = {
  isLiveSurfaceTraceEnabled,
  logLiveSurfaceTrace,
  summarizeCurrentTurn,
  summarizeWindow,
};
