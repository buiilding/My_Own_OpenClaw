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
    initialState = {},
    getCurrentServerUserId = () => null,
    setCurrentServerUserId = () => {},
  } = deps;
  let currentInstallToken = initialState.currentInstallToken || null;
  let currentUserId = initialState.currentUserId || null;
  let currentInstallId = initialState.currentInstallId || null;

  function getCurrentState() {
    return {
      installToken: currentInstallToken || null,
      userId: currentUserId || null,
      installId: currentInstallId || null,
    };
  }

  function getCurrentUserId() {
    return currentUserId;
  }

  function setCurrentUserId(userId) {
    currentUserId = userId;
  }

  function applyInstallAuthState(state) {
    const normalized = normalizeInstallAuthState(state);
    if (!normalized) {
      return null;
    }
    currentInstallToken = normalized.installToken;
    currentInstallId = normalized.installId;
    currentUserId = normalized.userId;
    if (!getCurrentServerUserId()) {
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

  function reset() {
    currentInstallToken = null;
    currentUserId = null;
    currentInstallId = null;
  }

  return {
    applyInstallAuthState,
    buildDesktopInstallAuth,
    getCurrentState,
    getCurrentUserId,
    reset,
    setCurrentUserId,
  };
}

module.exports = {
  createInstallAuthIdentityRuntime,
};
