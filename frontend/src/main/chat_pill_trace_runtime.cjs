function isTraceEnabled() {
  return (
    process.env.WINDIE_DEBUG_CHAT_PILL === '1'
    || process.env.WINDIE_DEBUG_STREAM_EVENTS === '1'
  );
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalBoolean(value) {
  if (typeof value !== 'boolean') {
    return null;
  }
  return value;
}

function safeReadVisibility(win) {
  if (!win || typeof win !== 'object' || typeof win.isDestroyed !== 'function') {
    return null;
  }
  if (win.isDestroyed()) {
    return null;
  }
  return typeof win.isVisible === 'function' ? Boolean(win.isVisible()) : null;
}

function safeCall(getter, fallback = null) {
  if (typeof getter !== 'function') {
    return fallback;
  }
  try {
    const value = getter();
    return value ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function buildBasePayload(event = {}, deps = {}) {
  return {
    platform: process.platform,
    source: normalizeOptionalString(event.source) || 'main',
    action: normalizeOptionalString(event.action) || 'unknown',
    turn_id: normalizeOptionalString(event.turnId),
    correlation_id: normalizeOptionalString(event.correlationId),
    phase: normalizeOptionalString(event.phase)
      || normalizeOptionalString(safeCall(deps.getResponseOverlayPhase)),
    include_query_screenshot: normalizeOptionalBoolean(event.includeQueryScreenshot),
    chat_window_visible: (
      typeof event.chatWindowVisible === 'boolean'
        ? event.chatWindowVisible
        : safeReadVisibility(event.chatWindow || deps.chatWindow)
    ),
    response_window_visible: (
      typeof event.responseWindowVisible === 'boolean'
        ? event.responseWindowVisible
        : safeReadVisibility(event.responseWindow || deps.responseWindow)
    ),
    response_overlay_visible_flag: (
      typeof event.responseOverlayVisibleFlag === 'boolean'
        ? event.responseOverlayVisibleFlag
        : normalizeOptionalBoolean(safeCall(deps.getResponseOverlayVisible))
    ),
    response_layout_mode: normalizeOptionalString(event.responseLayoutMode),
    show_response: normalizeOptionalBoolean(event.showResponse),
    show_awaiting_reply: normalizeOptionalBoolean(event.showAwaitingReply),
  };
}

function logChatPillMainTrace(event = {}, deps = {}) {
  if (!isTraceEnabled()) {
    return;
  }

  const payload = buildBasePayload(event, deps);
  if (typeof event.reason === 'string' && event.reason.trim()) {
    payload.reason = event.reason.trim();
  }
  if (typeof event.focus === 'boolean') {
    payload.focus = event.focus;
  }
  if (typeof event.restoreResponseOverlay === 'boolean') {
    payload.restore_response_overlay = event.restoreResponseOverlay;
  }

  console.log('[ChatPillTrace][main]', payload);
}

module.exports = {
  logChatPillMainTrace,
};
