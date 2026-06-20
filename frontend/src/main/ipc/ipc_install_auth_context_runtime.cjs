/**
 * Composes Electron main install-auth identity and registration runtime state.
 */

const {
  createInstallAuthRuntime,
} = require('./ipc_install_auth_runtime.cjs');
const {
  createInstallAuthIdentityRuntime,
} = require('./ipc_install_auth_identity_runtime.cjs');

function createInstallAuthContextRuntime({
  getCurrentServerUserId,
  setCurrentServerUserId,
  getEndpointCandidates,
  setActiveBackendEndpoint,
  loadInstallAuthStateFromDisk,
  validateInstallAuthStateWithBackend,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
  clearInstallAuthStateFromDisk,
  getPlatform,
  log,
} = {}) {
  const identityRuntime = createInstallAuthIdentityRuntime({
    getCurrentServerUserId,
    setCurrentServerUserId,
  });
  const authRuntime = createInstallAuthRuntime({
    getCurrentState: () => identityRuntime.getCurrentState(),
    applyInstallAuthState: (state) => identityRuntime.applyInstallAuthState(state),
    getEndpointCandidates,
    setActiveBackendEndpoint,
    loadInstallAuthStateFromDisk,
    validateInstallAuthStateWithBackend,
    registerInstallWithBackend,
    saveInstallAuthStateToDisk,
    clearInstallAuthStateFromDisk,
    getPlatform,
    log,
  });

  function reset() {
    identityRuntime.reset();
    authRuntime.reset();
  }

  return {
    applyInstallAuthState: (state) => identityRuntime.applyInstallAuthState(state),
    buildDesktopInstallAuth: () => identityRuntime.buildDesktopInstallAuth(),
    buildInstallAuthHeaders: () => authRuntime.buildInstallAuthHeaders(),
    ensureInstallAuthState: () => authRuntime.ensureInstallAuthState(),
    getCurrentState: () => identityRuntime.getCurrentState(),
    getCurrentUserId: () => identityRuntime.getCurrentUserId(),
    reset,
    setCurrentUserId: (userId) => identityRuntime.setCurrentUserId(userId),
  };
}

module.exports = {
  createInstallAuthContextRuntime,
};
