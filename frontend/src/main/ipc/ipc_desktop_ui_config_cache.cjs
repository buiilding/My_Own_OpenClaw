/**
 * Owns the Electron-main cached desktop UI config value.
 */

function defaultIsValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
}

function createDesktopUiConfigCache({
  initialConfig = null,
  isValidConfigPayload = defaultIsValidConfigPayload,
} = {}) {
  let latestDesktopUiConfig = initialConfig;

  function getRaw() {
    return latestDesktopUiConfig;
  }

  function set(config) {
    latestDesktopUiConfig = config;
  }

  function reset() {
    latestDesktopUiConfig = null;
  }

  function getSnapshot() {
    if (!isValidConfigPayload(latestDesktopUiConfig)) {
      return null;
    }
    return { ...latestDesktopUiConfig };
  }

  return {
    getRaw,
    getSnapshot,
    reset,
    set,
  };
}

module.exports = {
  createDesktopUiConfigCache,
};
