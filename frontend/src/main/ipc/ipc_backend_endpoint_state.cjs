/**
 * Provides the ipc backend endpoint state module for the Electron main process.
 */

function createBackendEndpointState({
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
  env = process.env,
}) {
  let endpoints = resolveBackendEndpoints(env);
  let candidates = [endpoints];
  let activeIndex = 0;

  function refresh(options = {}) {
    candidates = resolveBackendEndpointCandidates(env, options);
    activeIndex = 0;
    endpoints = candidates[0] || resolveBackendEndpoints(env, options);
    return endpoints;
  }

  function setActive(index) {
    const candidate = candidates[index];
    if (!candidate) {
      return false;
    }
    activeIndex = index;
    endpoints = candidate;
    return true;
  }

  function advance() {
    return setActive(activeIndex + 1);
  }

  function getEndpoint() {
    return endpoints;
  }

  function getCandidates() {
    return [...candidates];
  }

  function getWsUrl() {
    return endpoints.wsUrl;
  }

  function getHttpUrl() {
    return endpoints.httpUrl;
  }

  return {
    advance,
    getCandidates,
    getEndpoint,
    getHttpUrl,
    getWsUrl,
    refresh,
    setActive,
  };
}

function createBackendEndpointRuntime({
  configureBackendEndpointRuntime,
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
  env = process.env,
}) {
  const state = createBackendEndpointState({
    resolveBackendEndpointCandidates,
    resolveBackendEndpoints,
    env,
  });

  function configureHostedBackend(hostedBackend) {
    if (typeof configureBackendEndpointRuntime === 'function') {
      configureBackendEndpointRuntime(hostedBackend);
    }
    return state.refresh();
  }

  return {
    ...state,
    configureHostedBackend,
  };
}

module.exports = {
  createBackendEndpointRuntime,
  createBackendEndpointState,
};
