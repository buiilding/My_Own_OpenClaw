/**
 * Owns Electron-main trace event routing into app diagnostics or SDK conversation traces.
 */

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizePositiveInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function createMainProcessTraceRuntime({
  ensureAgent,
  appendAppDiagnostic,
  permissionProbeDiagnosticsPath,
  TraceRecorder,
  createConversationEvent,
} = {}) {
  async function appendMainProcessTraceEvent(input = {}) {
    const path = normalizeOptionalString(input.path);
    const conversationRef = normalizeOptionalString(input.conversationRef);
    const turnRef = normalizeOptionalString(input.turnRef);
    if (path === permissionProbeDiagnosticsPath && (!conversationRef || !turnRef)) {
      return appendAppDiagnostic({
        path,
        stage: normalizeOptionalString(input.stage) || 'unknown',
        status: normalizeOptionalString(input.status) || 'succeeded',
        runtime: normalizeOptionalString(input.runtime) || 'electron-main',
        requestId: normalizeOptionalString(input.requestId),
        durationMs: normalizePositiveInteger(input.durationMs),
        data: isPlainObject(input.data) ? input.data : {},
        error: input.error,
      });
    }
    if (!conversationRef) {
      return { stored: false, reason: 'missing_conversation_ref' };
    }
    if (!turnRef) {
      return { stored: false, reason: 'missing_turn_ref' };
    }
    if (typeof ensureAgent !== 'function') {
      return { stored: false, reason: 'missing_agent_runtime' };
    }
    const agent = await ensureAgent({
      reason: 'main-process-trace',
      conversationRef,
    });
    const recorder = new TraceRecorder({
      conversationRef,
      turnRef,
      runtime: input.runtime || 'electron-main',
      emit: async (payload) => {
        await agent.appendConversationEvent(createConversationEvent({
          type: 'trace_event',
          conversationRef,
          turnRef,
          source: 'ui',
          payload,
        }));
      },
    });
    const payload = await recorder.record({
      path,
      stage: input.stage,
      status: input.status,
      runtime: input.runtime || 'electron-main',
      requestId: input.requestId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      durationMs: input.durationMs,
      data: input.data,
      error: input.error,
    });
    return { stored: true, traceId: payload.traceId, spanId: payload.spanId };
  }

  return {
    appendMainProcessTraceEvent,
  };
}

module.exports = {
  createMainProcessTraceRuntime,
  isPlainObject,
  normalizeOptionalString,
  normalizePositiveInteger,
};
