/**
 * Owns Electron main active Agent SDK adapter lifecycle state.
 */

function createAgentRuntimeLifecycle(deps = {}) {
  const {
    startAgent,
    getAgentClient,
    getAgentClientIfInitialized = () => null,
    logMainRuntime = () => {},
    getCurrentConversationRef = () => null,
    defaultBackendConnectTimeoutMs = undefined,
  } = deps;
  let activeAgent = null;
  let pendingAgentStartPromise = null;

  async function ensureAgent({ reason = 'request', workspacePath = null } = {}) {
    if (activeAgent) {
      return activeAgent;
    }
    if (!pendingAgentStartPromise) {
      pendingAgentStartPromise = startAgent({
        reason,
        workspacePath,
      })
        .then((agent) => {
          activeAgent = agent;
          return agent;
        })
        .finally(() => {
          pendingAgentStartPromise = null;
        });
    }
    return pendingAgentStartPromise;
  }

  function getActiveAgent() {
    return activeAgent;
  }

  function syncBackendIdleDisconnectTimer(reason = 'idle-sync') {
    activeAgent?.syncBackendIdleTimer?.(reason);
  }

  function noteBackendTraffic(reason = 'traffic') {
    activeAgent?.noteBackendTraffic?.(reason);
  }

  function getKnownAgentLocalRuntime() {
    return getAgentClientIfInitialized()?.getKnownLocalRuntime?.() || activeAgent?.localRuntime || null;
  }

  async function ensureAgentLocalRuntime({ reason = 'local-runtime' } = {}) {
    logMainRuntime(`[Main][SDK] local_runtime_ensure_start reason=${reason}`);
    try {
      const runtime = await getAgentClient().localRuntime({ reason });
      logMainRuntime(`[Main][SDK] local_runtime_ready reason=${reason}`);
      return runtime;
    } catch (error) {
      logMainRuntime(`[Main][SDK] local_runtime_failed reason=${reason} message=${JSON.stringify(error?.message || String(error))}`);
      throw error;
    }
  }

  function isBackendRuntimeConnected(isConnected) {
    return Boolean(isConnected) && Boolean(activeAgent?.isConnected?.());
  }

  async function ensureBackendConnection({
    reason = 'request',
    timeoutMs = undefined,
    conversationRef = null,
  } = {}) {
    const agent = await ensureAgent({ reason });
    return agent.ensureConnected({
      reason,
      timeoutMs,
      conversationRef,
    });
  }

  function ensureCurrentBackendConnection(
    reason = 'request',
    timeoutMs = defaultBackendConnectTimeoutMs,
  ) {
    return ensureBackendConnection({
      reason,
      timeoutMs,
      conversationRef: getCurrentConversationRef(),
    });
  }

  function reset({ closeActiveAgent = false } = {}) {
    pendingAgentStartPromise = null;
    if (closeActiveAgent) {
      activeAgent?.close?.();
    }
    activeAgent = null;
  }

  return {
    ensureAgent,
    getActiveAgent,
    syncBackendIdleDisconnectTimer,
    noteBackendTraffic,
    getKnownAgentLocalRuntime,
    ensureAgentLocalRuntime,
    isBackendRuntimeConnected,
    ensureBackendConnection,
    ensureCurrentBackendConnection,
    reset,
  };
}

module.exports = {
  createAgentRuntimeLifecycle,
};
