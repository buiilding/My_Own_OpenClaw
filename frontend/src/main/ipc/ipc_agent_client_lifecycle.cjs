/**
 * Owns Electron main AgentClient instance caching and shutdown.
 */

function createAgentClientLifecycleRuntime(deps = {}) {
  const {
    createAgentClient,
    logMainRuntime = () => {},
  } = deps;
  let agentClient = null;

  function getAgentClient() {
    if (!agentClient) {
      logMainRuntime('[Main][SDK] client_initialized');
      agentClient = createAgentClient();
    }
    return agentClient;
  }

  function getAgentClientIfInitialized() {
    return agentClient;
  }

  function shutdownLocalRuntime() {
    void agentClient?.shutdownLocalRuntime?.();
  }

  function reset() {
    agentClient = null;
  }

  function shutdownAndReset() {
    shutdownLocalRuntime();
    reset();
  }

  return {
    getAgentClient,
    getAgentClientIfInitialized,
    shutdownLocalRuntime,
    reset,
    shutdownAndReset,
  };
}

module.exports = {
  createAgentClientLifecycleRuntime,
};
