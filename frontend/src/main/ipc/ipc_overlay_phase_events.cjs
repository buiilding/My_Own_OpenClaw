const {
  normalizeOverlayNumber,
  normalizeOverlayString,
} = require('./ipc_overlay_phase_contract.cjs');

const BACKEND_OVERLAY_PHASE_TRANSITIONS = Object.freeze({
  'query-accepted': Object.freeze({
    phase: 'awaiting-first-chunk',
    recoveryStage: null,
  }),
  'streaming-response': Object.freeze({
    phase: 'streaming',
    recoveryStage: null,
  }),
  'tool-call': Object.freeze({
    phase: 'tool-call',
    recoveryStage: 'tool-call',
  }),
  'tool-bundle': Object.freeze({
    phase: 'tool-call',
    recoveryStage: 'tool-call',
  }),
  'web-search-progress': Object.freeze({
    phase: 'tool-call',
    recoveryStage: 'tool-call',
  }),
  'tool-output': Object.freeze({
    phase: 'tool-output',
    recoveryStage: 'tool-output',
  }),
  'streaming-complete': Object.freeze({
    phase: 'complete',
    recoveryStage: null,
  }),
});

const TERMINAL_FALLBACK_OVERLAY_EVENT_TYPES = new Set([
  'token-count',
  'memory-store',
  'assistant-message-full',
]);

function resolveOverlayCorrelationId(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = (
    data.payload
    && typeof data.payload === 'object'
    && !Array.isArray(data.payload)
  )
    ? data.payload
    : null;
  if (!payload) {
    return null;
  }

  const candidateKeys = ['request_id', 'correlation_id', 'bundle_id'];
  for (const key of candidateKeys) {
    const value = normalizeOverlayString(payload[key]);
    if (value) {
      return value;
    }
  }

  return normalizeOverlayString(data.id);
}

function resolveOverlayPhaseMetadata(data, recoveryStage) {
  const metadata = {};
  if (recoveryStage) {
    metadata.recovery_stage = recoveryStage;
  }
  const correlationId = resolveOverlayCorrelationId(data);
  if (correlationId) {
    metadata.correlation_id = correlationId;
  }

  const payloadMetadata = (
    data?.payload?.metadata
    && typeof data.payload.metadata === 'object'
    && !Array.isArray(data.payload.metadata)
  )
    ? data.payload.metadata
    : null;

  const attempt = normalizeOverlayNumber(payloadMetadata?.attempt);
  if (attempt !== null) {
    metadata.attempt = attempt;
  }
  const maxAttempts = normalizeOverlayNumber(payloadMetadata?.max_attempts);
  if (maxAttempts !== null) {
    metadata.max_attempts = maxAttempts;
  }
  const payloadFailureReason = normalizeOverlayString(payloadMetadata?.failure_reason);
  if (payloadFailureReason) {
    metadata.failure_reason = payloadFailureReason;
  }
  const payloadMessage = normalizeOverlayString(data?.payload?.message);
  if (payloadMessage) {
    metadata.failure_reason = payloadMessage;
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

function resolveBackendOverlayPhaseTransition(data, currentPhase) {
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
    return null;
  }

  const transition = BACKEND_OVERLAY_PHASE_TRANSITIONS[data.type];
  if (transition) {
    const metadata = resolveOverlayPhaseMetadata(data, transition.recoveryStage);
    return {
      phase: transition.phase,
      metadata,
    };
  }

  if (
    TERMINAL_FALLBACK_OVERLAY_EVENT_TYPES.has(data.type)
    && currentPhase !== 'idle'
    && currentPhase !== 'complete'
    && currentPhase !== 'error'
  ) {
    return {
      phase: 'complete',
      metadata: resolveOverlayPhaseMetadata(data, null),
    };
  }

  if (data.type === 'error' && currentPhase !== 'idle') {
    return {
      phase: 'error',
      metadata: resolveOverlayPhaseMetadata(data, 'error'),
    };
  }

  return null;
}

module.exports = {
  resolveBackendOverlayPhaseTransition,
};
