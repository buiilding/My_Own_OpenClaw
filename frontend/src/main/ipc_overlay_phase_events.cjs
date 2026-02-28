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
    const value = payload[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return typeof data.id === 'string' && data.id.length > 0 ? data.id : null;
}

function resolveOverlayPhaseMetadata(data, recoveryStage) {
  const metadata = { recovery_stage: recoveryStage };
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

  if (typeof payloadMetadata?.attempt === 'number' && Number.isFinite(payloadMetadata.attempt)) {
    metadata.attempt = payloadMetadata.attempt;
  }
  if (typeof payloadMetadata?.max_attempts === 'number' && Number.isFinite(payloadMetadata.max_attempts)) {
    metadata.max_attempts = payloadMetadata.max_attempts;
  }
  if (typeof payloadMetadata?.failure_reason === 'string' && payloadMetadata.failure_reason.length > 0) {
    metadata.failure_reason = payloadMetadata.failure_reason;
  }
  if (typeof data?.payload?.message === 'string' && data.payload.message.length > 0) {
    metadata.failure_reason = data.payload.message;
  }

  return metadata;
}

function resolveBackendOverlayPhaseTransition(data, currentPhase) {
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
    return null;
  }

  if (data.type === 'streaming-response') {
    return { phase: 'streaming', metadata: null };
  }

  if (data.type === 'tool-call' || data.type === 'tool-bundle') {
    return {
      phase: 'tool-call',
      metadata: resolveOverlayPhaseMetadata(data, 'tool-call'),
    };
  }

  if (data.type === 'tool-output') {
    return {
      phase: 'awaiting-first-chunk',
      metadata: resolveOverlayPhaseMetadata(data, 'tool-output'),
    };
  }

  if (data.type === 'streaming-complete') {
    return { phase: 'complete', metadata: null };
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
  resolveOverlayCorrelationId,
  resolveOverlayPhaseMetadata,
};
