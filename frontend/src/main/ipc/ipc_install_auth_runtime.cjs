/**
 * Provides install-auth runtime orchestration for the Electron main process.
 */

const {
  resolveDesktopHostOperatingSystem,
} = require('./ipc_desktop_host_os_runtime.cjs');

function normalizeInstallAuthState(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const installToken = typeof payload.installToken === 'string' ? payload.installToken.trim() : '';
  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  const installId = typeof payload.installId === 'string' ? payload.installId.trim() : '';
  if (!installToken || !userId || !installId) {
    return null;
  }
  return {
    installToken,
    userId,
    installId,
  };
}

function normalizeInstallToken(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return '';
  }
  return typeof payload.installToken === 'string' ? payload.installToken.trim() : '';
}

function createInstallAuthRuntime({
  getCurrentState,
  applyInstallAuthState,
  getEndpointCandidates,
  setActiveBackendEndpoint,
  loadInstallAuthStateFromDisk,
  validateInstallAuthStateWithBackend,
  registerInstallWithBackend,
  saveInstallAuthStateToDisk,
  clearInstallAuthStateFromDisk,
  getPlatform = () => process.platform,
  log = () => {},
} = {}) {
  if (typeof getCurrentState !== 'function') {
    throw new Error('Install auth runtime requires getCurrentState');
  }
  if (typeof applyInstallAuthState !== 'function') {
    throw new Error('Install auth runtime requires applyInstallAuthState');
  }
  if (typeof getEndpointCandidates !== 'function') {
    throw new Error('Install auth runtime requires getEndpointCandidates');
  }
  if (typeof setActiveBackendEndpoint !== 'function') {
    throw new Error('Install auth runtime requires setActiveBackendEndpoint');
  }
  if (typeof loadInstallAuthStateFromDisk !== 'function') {
    throw new Error('Install auth runtime requires loadInstallAuthStateFromDisk');
  }
  if (typeof validateInstallAuthStateWithBackend !== 'function') {
    throw new Error('Install auth runtime requires validateInstallAuthStateWithBackend');
  }
  if (typeof registerInstallWithBackend !== 'function') {
    throw new Error('Install auth runtime requires registerInstallWithBackend');
  }
  if (typeof saveInstallAuthStateToDisk !== 'function') {
    throw new Error('Install auth runtime requires saveInstallAuthStateToDisk');
  }
  if (typeof clearInstallAuthStateFromDisk !== 'function') {
    throw new Error('Install auth runtime requires clearInstallAuthStateFromDisk');
  }

  let pendingInstallAuthStatePromise = null;

  function getEndpointCandidateList() {
    const candidates = getEndpointCandidates();
    return Array.isArray(candidates) ? candidates : [];
  }

  function applyState(state) {
    return applyInstallAuthState(normalizeInstallAuthState(state));
  }

  function buildInstallAuthHeaders() {
    const installToken = normalizeInstallToken(getCurrentState());
    if (!installToken) {
      return {};
    }
    return {
      Authorization: `Bearer ${installToken}`,
    };
  }

  async function ensureInstallAuthState() {
    const currentState = applyState(getCurrentState());
    if (currentState) {
      return currentState;
    }
    if (pendingInstallAuthStatePromise) {
      return pendingInstallAuthStatePromise;
    }

    pendingInstallAuthStatePromise = (async () => {
      let lastError = null;
      const endpointCandidates = getEndpointCandidateList();
      const cachedDiskState = await loadInstallAuthStateFromDisk(log);
      if (cachedDiskState) {
        let sawInvalidCachedToken = false;
        for (let index = 0; index < endpointCandidates.length; index += 1) {
          const candidate = endpointCandidates[index];
          const validation = await validateInstallAuthStateWithBackend(cachedDiskState, {
            backendHttpUrl: candidate.httpUrl,
          });
          if (validation.valid && validation.state) {
            setActiveBackendEndpoint(index);
            const validatedState = applyState(validation.state);
            const persistedIdentityMatches = (
              validation.state.userId === cachedDiskState.userId
              && validation.state.installId === cachedDiskState.installId
            );
            if (!persistedIdentityMatches) {
              await saveInstallAuthStateToDisk(validation.state, log);
            }
            return validatedState;
          }
          if (validation.invalidToken) {
            sawInvalidCachedToken = true;
            log(`Cached install auth was rejected by ${candidate.httpUrl} (${validation.status || 'invalid'}); registering a fresh install.`);
          } else {
            lastError = new Error(
              `Install auth validation failed against ${candidate.httpUrl}: ${validation.error || 'unknown error'}`,
            );
            log(lastError.message);
          }
        }
        if (!sawInvalidCachedToken) {
          const cachedState = applyState(cachedDiskState);
          if (cachedState) {
            return cachedState;
          }
        }
        await clearInstallAuthStateFromDisk(log);
      }

      for (let index = 0; index < endpointCandidates.length; index += 1) {
        const candidate = endpointCandidates[index];
        try {
          const registeredState = await registerInstallWithBackend({
            backendHttpUrl: candidate.httpUrl,
            operatingSystem: resolveDesktopHostOperatingSystem(getPlatform()),
            log,
          });
          const persistResult = await saveInstallAuthStateToDisk(registeredState, log);
          if (!persistResult?.success) {
            throw new Error(persistResult?.error || 'Failed to persist install auth state');
          }
          setActiveBackendEndpoint(index);
          return applyState(registeredState);
        } catch (error) {
          lastError = error;
          log(`Install registration failed against ${candidate.httpUrl}: ${error?.message || error}`);
        }
      }
      throw lastError || new Error('Failed to register install with backend');
    })().finally(() => {
      pendingInstallAuthStatePromise = null;
    });

    return pendingInstallAuthStatePromise;
  }

  function reset() {
    pendingInstallAuthStatePromise = null;
  }

  return {
    buildInstallAuthHeaders,
    ensureInstallAuthState,
    reset,
  };
}

module.exports = {
  createInstallAuthRuntime,
  resolveDesktopHostOperatingSystem,
};
