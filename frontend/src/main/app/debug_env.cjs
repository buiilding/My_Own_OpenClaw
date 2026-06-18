/**
 * Resolves debug environment flags for the generic Electron agent host.
 */

const DEFAULT_DEBUG_ENV = Object.freeze({
  chatPill: 'AGENT_DEBUG_CHAT_PILL',
  devUi: 'AGENT_DEV_UI',
  ghostOverlay: 'AGENT_DEBUG_GHOST_OVERLAY',
  ipcStdout: 'AGENT_DEBUG_IPC_STDOUT',
  liveSurface: 'AGENT_DEBUG_LIVE_SURFACE',
  localRuntimeStdout: 'AGENT_DEBUG_LOCAL_RUNTIME_STDOUT',
  startupStdout: 'AGENT_DEBUG_STARTUP_STDOUT',
  streamEvents: 'AGENT_DEBUG_STREAM_EVENTS',
  surfaceStdout: 'AGENT_DEBUG_SURFACE_STDOUT',
  toolScreenshot: 'AGENT_DEBUG_TOOL_SCREENSHOT',
  wakewordStdout: 'AGENT_DEBUG_WAKEWORD_STDOUT',
});

let activeDebugEnvConfig = DEFAULT_DEBUG_ENV;

function normalizeEnvKey(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function isTruthyEnvFlag(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function resolveDebugEnvConfig(config = {}) {
  const debugEnv = config?.env && typeof config.env === 'object' ? config.env : config;
  return Object.freeze(Object.fromEntries(
    Object.entries(DEFAULT_DEBUG_ENV).map(([key, fallback]) => [
      key,
      normalizeEnvKey(debugEnv?.[key], fallback),
    ]),
  ));
}

function configureDebugEnvRuntime(config = {}) {
  activeDebugEnvConfig = resolveDebugEnvConfig(config);
  return activeDebugEnvConfig;
}

function isDebugFlagEnabled(flag, env = process.env, config = activeDebugEnvConfig) {
  const envConfig = resolveDebugEnvConfig(config);
  const envKey = envConfig[flag];
  return isTruthyEnvFlag(env?.[envKey]);
}

module.exports = {
  configureDebugEnvRuntime,
  isDebugFlagEnabled,
  resolveDebugEnvConfig,
};
