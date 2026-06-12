function isLiveSurfaceTraceEnabled() {
  return (
    process.env.WINDIE_DEBUG_LIVE_SURFACE === '1'
    || process.env.WINDIE_DEBUG_CHAT_PILL === '1'
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveStringKey(key) {
  return /text|content|password|secret|token|credential|authorization|cookie|apikey|src|url|path|data|base64|image|screenshot|file/i.test(key);
}

function summarizeStringForTrace(value) {
  return `[redacted:string:${value.length}]`;
}

function sanitizeRendererTraceValue(key, value, depth = 0) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    if (isSensitiveStringKey(key) || value.length > 180 || value.startsWith('data:')) {
      return summarizeStringForTrace(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return { count: value.length };
  }
  if (!isPlainObject(value) || depth >= 3) {
    return undefined;
  }
  const sanitized = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, 40)) {
    const nextValue = sanitizeRendererTraceValue(childKey, childValue, depth + 1);
    if (nextValue !== undefined) {
      sanitized[childKey] = nextValue;
    }
  }
  return sanitized;
}

function normalizeRendererLiveSurfaceTracePayload(payload = {}) {
  if (!isPlainObject(payload)) {
    return null;
  }
  const event = normalizeString(payload.event) || 'unknown';
  const sanitizedPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'event' || key === 'process' || key === 'ts') {
      continue;
    }
    const sanitizedValue = sanitizeRendererTraceValue(key, value);
    if (sanitizedValue !== undefined) {
      sanitizedPayload[key] = sanitizedValue;
    }
  }
  return {
    event,
    payload: sanitizedPayload,
  };
}

function handleRendererLiveSurfaceTrace(payload = {}, {
  log = console.log,
} = {}) {
  const normalized = normalizeRendererLiveSurfaceTracePayload(payload);
  if (!normalized) {
    return false;
  }
  logLiveSurfaceTrace(normalized.event, normalized.payload, {
    log,
    processName: 'renderer',
  });
  return true;
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
  handleRendererLiveSurfaceTrace,
  isLiveSurfaceTraceEnabled,
  logLiveSurfaceTrace,
  normalizeRendererLiveSurfaceTracePayload,
  summarizeCurrentTurn,
  summarizeWindow,
};
