/**
 * Owns Electron-main IPC host runtime configuration fan-out.
 */

function createIpcHostRuntimeConfig({
  backendEndpointState,
  configureDebugEnvRuntime,
} = {}) {
  function configure(config = {}) {
    if (
      backendEndpointState
      && typeof backendEndpointState.configureHostedBackend === 'function'
    ) {
      backendEndpointState.configureHostedBackend(config.hostedBackend);
    }
    if (typeof configureDebugEnvRuntime === 'function') {
      configureDebugEnvRuntime(config.debug);
    }
  }

  return {
    configure,
  };
}

module.exports = {
  createIpcHostRuntimeConfig,
};
