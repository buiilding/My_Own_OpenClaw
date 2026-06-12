const {
  FRONTEND_INTERACTION_DIAGNOSTICS_PATH,
  SURFACE_VISIBILITY_DIAGNOSTICS_PATH,
  appendDiagnosticEvent,
} = require('./app_diagnostics_store.cjs');

function normalizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function diagnosticId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function booleanOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

function appendDiagnosticSafely(event, append = appendDiagnosticEvent) {
  try {
    return append(event);
  } catch (_error) {
    return { stored: false };
  }
}

function compactData(data = {}) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null && typeof value !== 'undefined'),
  );
}

function appendSurfaceVisibilityDiagnostic(input = {}, options = {}) {
  const append = typeof options.appendDiagnosticEvent === 'function'
    ? options.appendDiagnosticEvent
    : appendDiagnosticEvent;
  const action = normalizeString(input.action) || 'unknown';
  const source = normalizeString(input.source);
  const phase = normalizeString(input.phase);
  const conversationRef = normalizeString(input.conversationRef || input.conversation_ref);
  const turnRef = normalizeString(input.turnRef || input.turn_ref);
  return appendDiagnosticSafely({
    traceId: normalizeString(input.traceId) || diagnosticId('surface-visibility'),
    path: SURFACE_VISIBILITY_DIAGNOSTICS_PATH,
    stage: action,
    status: normalizeString(input.status) || 'succeeded',
    runtime: 'electron-main',
    conversationRef,
    data: compactData({
      action,
      mode: normalizeString(input.mode),
      phase,
      source,
      reason: normalizeString(input.reason),
      userHidden: booleanOrNull(input.userHidden ?? input.user_hidden),
      focus: booleanOrNull(input.focus),
      restoreResponseOverlay: booleanOrNull(input.restoreResponseOverlay ?? input.restore_response_overlay),
      resultReason: normalizeString(input.resultReason || input.result_reason),
      chatWindowVisible: booleanOrNull(input.chatWindowVisible ?? input.chat_window_visible),
      responseWindowVisible: booleanOrNull(input.responseWindowVisible ?? input.response_window_visible),
      responseOverlayVisible: booleanOrNull(input.responseOverlayVisible ?? input.response_overlay_visible),
      responseOverlayVisibleFlag: booleanOrNull(input.responseOverlayVisibleFlag ?? input.response_overlay_visible_flag),
      requestedVisible: booleanOrNull(input.requestedVisible ?? input.requested_visible),
      responseLayoutMode: normalizeString(input.responseLayoutMode || input.response_layout_mode),
      width: Number.isFinite(input.width) ? input.width : null,
      height: Number.isFinite(input.height) ? input.height : null,
      activeGuardRef: normalizeString(input.activeGuardRef || input.active_guard_ref),
      staleGuardRef: normalizeString(input.staleGuardRef || input.stale_guard_ref),
      guardRef: normalizeString(input.guardRef || input.guard_ref),
      turnRef,
    }),
  }, append);
}

function appendFrontendInteractionDiagnostic(entry = {}, options = {}) {
  const append = typeof options.appendDiagnosticEvent === 'function'
    ? options.appendDiagnosticEvent
    : appendDiagnosticEvent;
  const target = entry.target && typeof entry.target === 'object' && !Array.isArray(entry.target)
    ? entry.target
    : {};
  return appendDiagnosticSafely({
    traceId: normalizeString(entry.traceId) || diagnosticId('frontend-interaction'),
    path: FRONTEND_INTERACTION_DIAGNOSTICS_PATH,
    stage: normalizeString(entry.action) || 'unknown',
    status: 'succeeded',
    runtime: 'renderer',
    conversationRef: normalizeString(entry.conversationRef || entry.conversation_ref),
    data: compactData({
      action: normalizeString(entry.action) || 'unknown',
      event: normalizeString(entry.event) || 'unknown',
      view: normalizeString(entry.view) || 'unknown',
      targetTag: normalizeString(target.tagName),
      targetType: normalizeString(target.type),
      targetRole: normalizeString(target.role),
      hasTargetLabel: Boolean(normalizeString(target.label)),
      messageTextLength: Number.isFinite(entry.messageTextLength) ? entry.messageTextLength : null,
      textLength: Number.isFinite(entry.textLength) ? entry.textLength : null,
      attachmentCount: Number.isFinite(entry.attachmentCount) ? entry.attachmentCount : null,
      imageCount: Number.isFinite(entry.imageCount) ? entry.imageCount : null,
      readableFileCount: Number.isFinite(entry.readableFileCount) ? entry.readableFileCount : null,
      senderSurface: normalizeString(entry.senderSurface),
    }),
  }, append);
}

module.exports = {
  appendFrontendInteractionDiagnostic,
  appendSurfaceVisibilityDiagnostic,
};
