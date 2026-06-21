/**
 * Owns Electron-main global stop shortcut status projection and config fallback persistence.
 */

function defaultIsValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
}

function normalizeAccelerator(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeGlobalAgentStopShortcutStatus(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    return null;
  }

  const supportedAccelerators = Array.isArray(status.supportedAccelerators)
    ? status.supportedAccelerators
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
    : [];

  return {
    enabled: status.enabled === true,
    requestedAccelerator: normalizeAccelerator(status.requestedAccelerator),
    resolvedAccelerator: normalizeAccelerator(status.resolvedAccelerator),
    registered: status.registered === true,
    registeredAccelerator: normalizeAccelerator(status.registeredAccelerator),
    registrationFailed: status.registrationFailed === true,
    usingFallback: status.usingFallback === true,
    supportedAccelerators,
  };
}

function applyGlobalStopShortcutFallbackToConfig(
  config,
  {
    status = null,
    isValidConfigPayload = defaultIsValidConfigPayload,
  } = {},
) {
  if (!isValidConfigPayload(config)) {
    return config;
  }
  const resolvedAccelerator = status?.resolvedAccelerator;
  if (
    status?.registrationFailed === true
    || typeof resolvedAccelerator !== 'string'
    || !resolvedAccelerator
    || config.global_agent_stop_shortcut === resolvedAccelerator
  ) {
    return config;
  }
  return {
    ...config,
    global_agent_stop_shortcut: resolvedAccelerator,
  };
}

function createGlobalStopShortcutConfigRuntime({
  isValidConfigPayload = defaultIsValidConfigPayload,
  getLatestDesktopUiConfig = () => null,
  persistDesktopUiConfigToDisk = null,
  broadcastConnectionStatus = null,
  isConnected = () => false,
} = {}) {
  let currentStatus = null;

  function getStatus() {
    return currentStatus;
  }

  function reset() {
    currentStatus = null;
  }

  function applyShortcutStatusFallbackToConfig(config) {
    return applyGlobalStopShortcutFallbackToConfig(config, {
      status: currentStatus,
      isValidConfigPayload,
    });
  }

  function updateGlobalAgentStopShortcutStatus(status) {
    currentStatus = normalizeGlobalAgentStopShortcutStatus(status);

    const latestDesktopUiConfig = getLatestDesktopUiConfig();
    if (isValidConfigPayload(latestDesktopUiConfig)) {
      const nextConfig = applyShortcutStatusFallbackToConfig(latestDesktopUiConfig);
      if (nextConfig !== latestDesktopUiConfig && typeof persistDesktopUiConfigToDisk === 'function') {
        void persistDesktopUiConfigToDisk(nextConfig);
      }
    }

    if (typeof broadcastConnectionStatus === 'function') {
      broadcastConnectionStatus(isConnected());
    }
  }

  return {
    applyShortcutStatusFallbackToConfig,
    getStatus,
    reset,
    updateGlobalAgentStopShortcutStatus,
  };
}

module.exports = {
  createGlobalStopShortcutConfigRuntime,
};
