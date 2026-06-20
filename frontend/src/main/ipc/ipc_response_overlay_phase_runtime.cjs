/**
 * Owns Electron main response-overlay phase application side effects.
 */

function createResponseOverlayPhaseRuntime(deps = {}) {
  const {
    responseOverlayPhaseState,
    logChatPillMainTrace = () => {},
    getApplyResponseOverlayPhase = () => null,
    getSetAgentLoopStopShortcutEnabled = () => null,
    isAgentLoopStopShortcutPhase = () => false,
    syncBackendIdleDisconnectTimer = () => {},
    broadcastToRenderers = () => {},
    log = () => {},
  } = deps;

  function getPhase() {
    return responseOverlayPhaseState.getPhase();
  }

  function setResponseOverlayPhase(phase, source = 'ipc', metadata = null) {
    logChatPillMainTrace({
      source: 'ipc',
      action: 'set-phase',
      phase,
      correlationId: metadata?.correlation_id || null,
      reason: source,
    }, {
      getResponseOverlayPhase: getPhase,
    });
    responseOverlayPhaseState.setPhase(phase, source, metadata, {
      onPhaseChange: getApplyResponseOverlayPhase(),
      broadcastToRenderers,
      log,
    });
    const setAgentLoopStopShortcutEnabled = getSetAgentLoopStopShortcutEnabled();
    if (typeof setAgentLoopStopShortcutEnabled === 'function') {
      setAgentLoopStopShortcutEnabled(
        isAgentLoopStopShortcutPhase(getPhase()),
      );
    }
    syncBackendIdleDisconnectTimer(`phase:${phase}`);
  }

  return {
    getPhase,
    setResponseOverlayPhase,
  };
}

module.exports = {
  createResponseOverlayPhaseRuntime,
};
