/**
 * Owns Electron main install-auth identity normalization and SDK option shaping.
 */

function normalizeInstallAuthState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return null;
  }
  const installToken = typeof state.installToken === 'string' ? state.installToken.trim() : '';
  const userId = typeof state.userId === 'string' ? state.userId.trim() : '';
  const installId = typeof state.installId === 'string' ? state.installId.trim() : '';
  if (!installToken || !userId || !installId) {
    return null;
  }
  return {
    installToken,
    userId,
    installId,
  };
}

function createInstallAuthIdentityRuntime(deps = {}) {
  const {
    getState = () => ({}),
    setInstallToken = () => {},
    setInstallId = () => {},
    setCurrentUserId = () => {},
    setCurrentServerUserId = () => {},
  } = deps;

  function getCurrentState() {
    const state = getState();
    return {
      installToken: state.currentInstallToken || null,
      userId: state.currentUserId || null,
      installId: state.currentInstallId || null,
    };
  }

  function applyInstallAuthState(state) {
    const normalized = normalizeInstallAuthState(state);
    if (!normalized) {
      return null;
    }
    setInstallToken(normalized.installToken);
    setInstallId(normalized.installId);
    setCurrentUserId(normalized.userId);
    if (!getState().currentServerUserId) {
      setCurrentServerUserId(normalized.userId);
    }
    return normalized;
  }

  function buildDesktopInstallAuth() {
    const state = getCurrentState();
    if (!state.installToken) {
      return undefined;
    }
    return {
      ...(state.userId ? { userId: state.userId } : {}),
      ...(state.installId ? { installId: state.installId } : {}),
      installToken: state.installToken,
      autoRegister: false,
    };
  }

  return {
    getCurrentState,
    applyInstallAuthState,
    buildDesktopInstallAuth,
  };
}

module.exports = {
  createInstallAuthIdentityRuntime,
  normalizeInstallAuthState,
};
