/**
 * Builds Electron-main dependencies for the direct wake-up Agent adapter.
 */

function createDirectWakeUpAgentAdapterDepsRuntime(deps = {}) {
  function build() {
    const {
      broadcastToRenderers,
      resolveRuntimeConversationRef,
      setLatestCurrentTurnProjection,
      isSupersededTurnRef,
      getLatestPendingTurn,
      pendingTurnMatchesCurrentTurn,
      clearLatestPendingTurn,
      logLiveSurfaceTrace,
      summarizeCurrentTurn,
      isDebugFlagEnabled,
      currentTurnTraceLogger,
      getSyncSdkLiveTurnSurfaceIntent,
      log,
      buildConversationTerminalStatus,
      resolveWorkspacePathForAgent,
      handleAgentBackendEvent,
      refreshMcpServersForConfig,
      getMcpClientInfo,
    } = deps;

    return {
      broadcastToRenderers,
      resolveRuntimeConversationRef,
      setLatestCurrentTurnProjection,
      isSupersededTurnRef,
      getLatestPendingTurn,
      pendingTurnMatchesCurrentTurn,
      clearLatestPendingTurn,
      logLiveSurfaceTrace,
      summarizeCurrentTurn,
      isDebugFlagEnabled,
      currentTurnTraceLogger,
      getSyncSdkLiveTurnSurfaceIntent,
      log,
      buildConversationTerminalStatus,
      resolveWorkspacePathForAgent,
      handleAgentBackendEvent,
      refreshMcpServersForConfig,
      getMcpClientInfo,
    };
  }

  return {
    build,
  };
}

module.exports = {
  createDirectWakeUpAgentAdapterDepsRuntime,
};
