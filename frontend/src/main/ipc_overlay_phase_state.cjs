const RESPONSE_OVERLAY_PHASES = new Set([
  'idle',
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
  'complete',
  'error',
]);

const RESPONSE_OVERLAY_METADATA_KEYS = [
  'correlation_id',
  'attempt',
  'max_attempts',
  'recovery_stage',
  'failure_reason',
];

function normalizeResponseOverlayMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const normalized = {};
  for (const key of RESPONSE_OVERLAY_METADATA_KEYS) {
    const value = metadata[key];
    if (key === 'attempt' || key === 'max_attempts') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        normalized[key] = value;
      }
      continue;
    }
    if (typeof value === 'string' && value.length > 0) {
      normalized[key] = value;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function areResponseOverlayMetadataEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  for (const key of RESPONSE_OVERLAY_METADATA_KEYS) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function createResponseOverlayPhaseState() {
  let phase = 'idle';
  let metadata = null;

  function getPhase() {
    return phase;
  }

  function setPhase(nextPhase, source = 'ipc', nextMetadata = null, deps = {}) {
    if (!RESPONSE_OVERLAY_PHASES.has(nextPhase)) {
      return;
    }
    const normalizedMetadata = normalizeResponseOverlayMetadata(nextMetadata);
    if (
      phase === nextPhase
      && areResponseOverlayMetadataEqual(metadata, normalizedMetadata)
    ) {
      return;
    }
    phase = nextPhase;
    metadata = normalizedMetadata;

    const payload = { phase: nextPhase, source };
    if (normalizedMetadata) {
      Object.assign(payload, normalizedMetadata);
    }

    if (typeof deps.onPhaseChange === 'function') {
      try {
        deps.onPhaseChange(payload);
      } catch (error) {
        if (typeof deps.log === 'function') {
          deps.log(`Response overlay phase callback failed: ${error.message}`);
        }
      }
    }
    if (typeof deps.broadcastToRenderers === 'function') {
      deps.broadcastToRenderers('response-overlay-phase', payload);
    }
  }

  return {
    getPhase,
    setPhase,
  };
}

module.exports = {
  RESPONSE_OVERLAY_PHASES,
  areResponseOverlayMetadataEqual,
  createResponseOverlayPhaseState,
  normalizeResponseOverlayMetadata,
};
