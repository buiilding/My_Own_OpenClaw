/**
 * Provides the ipc overlay phase state module for the Electron main process.
 */

const {
  RESPONSE_OVERLAY_PHASES,
  RESPONSE_OVERLAY_METADATA_KEYS,
  normalizeOverlayNumber,
  normalizeOverlayString,
} = require('./ipc_overlay_phase_contract.cjs');

function normalizeResponseOverlayMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const normalized = {};
  for (const key of RESPONSE_OVERLAY_METADATA_KEYS) {
    const value = metadata[key];
    if (key === 'attempt' || key === 'max_attempts') {
      const normalizedNumber = normalizeOverlayNumber(value);
      if (normalizedNumber !== null) {
        normalized[key] = normalizedNumber;
      }
      continue;
    }
    const normalizedString = normalizeOverlayString(value);
    if (normalizedString !== null) {
      normalized[key] = normalizedString;
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
  createResponseOverlayPhaseState,
};
