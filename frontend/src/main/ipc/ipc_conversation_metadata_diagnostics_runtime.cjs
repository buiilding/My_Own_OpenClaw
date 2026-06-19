/**
 * Builds conversation metadata list diagnostics for Electron main IPC.
 */

const {
  APP_DIAGNOSTICS_PATH,
} = require('../diagnostics/app_diagnostics_store.cjs');

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeAppDiagnosticContext(payload = {}, state = {}) {
  const diagnostics = isPlainObject(payload._diagnostics) ? payload._diagnostics : {};
  return {
    path: normalizeOptionalString(diagnostics.path) || APP_DIAGNOSTICS_PATH,
    traceId: normalizeOptionalString(diagnostics.traceId) || undefined,
    parentSpanId: normalizeOptionalString(diagnostics.parentSpanId) || null,
    requestId: normalizeOptionalString(diagnostics.requestId) || undefined,
    sessionId: normalizeOptionalString(diagnostics.sessionId) || state.currentSessionId || undefined,
    conversationRef: normalizeOptionalString(diagnostics.conversationRef)
      || state.currentConversationRef
      || undefined,
  };
}

function recordConversationMetadataListDiagnostic(appendAppDiagnostic, context = {}, input = {}) {
  const requestId = input.requestId || context.requestId;
  const event = {
    path: context.path || APP_DIAGNOSTICS_PATH,
    traceId: context.traceId,
    parentSpanId: input.parentSpanId || context.parentSpanId || null,
    requestId,
    sessionId: input.sessionId || context.sessionId,
    conversationRef: input.conversationRef || context.conversationRef,
    ...input,
    data: {
      ...(input.data || {}),
      ...(requestId ? { requestId } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    },
  };
  const result = appendAppDiagnostic(event);
  if (result?.traceId && !context.traceId) {
    context.traceId = result.traceId;
  }
  return result;
}

module.exports = {
  normalizeAppDiagnosticContext,
  recordConversationMetadataListDiagnostic,
};
