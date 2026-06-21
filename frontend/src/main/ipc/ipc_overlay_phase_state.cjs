/**
 * Provides the ipc overlay phase state module for the Electron main process.
 */

const {
  createResponseOverlayPhaseContractRuntime,
} = require('./ipc_overlay_phase_contract.cjs');

const overlayPhaseContractRuntime = createResponseOverlayPhaseContractRuntime();

function createResponseOverlayPhaseState() {
  let phase = 'idle';
  let metadata = null;

  function getPhase() {
    return phase;
  }

  function setPhase(nextPhase, source = 'ipc', nextMetadata = null, deps = {}) {
    if (!overlayPhaseContractRuntime.hasPhase(nextPhase)) {
      return;
    }
    const normalizedMetadata = overlayPhaseContractRuntime.normalizeMetadata(nextMetadata);
    if (
      phase === nextPhase
      && overlayPhaseContractRuntime.areMetadataEqual(metadata, normalizedMetadata)
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
