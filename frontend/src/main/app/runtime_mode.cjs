/**
 * Coordinates the runtime mode for the Electron main process.
 */

const DEFAULT_RUNTIME_MODE_ENV = Object.freeze({
  vmMode: 'AGENT_VM_MODE',
  vmWorkerMode: 'AGENT_VM_WORKER_MODE',
});

function normalizeEnvKey(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeRuntimeModeEnvConfig(config = {}) {
  const rawConfig = config && typeof config === 'object' ? config : {};
  return {
    vmMode: normalizeEnvKey(rawConfig.vmMode, DEFAULT_RUNTIME_MODE_ENV.vmMode),
    vmWorkerMode: normalizeEnvKey(
      rawConfig.vmWorkerMode,
      DEFAULT_RUNTIME_MODE_ENV.vmWorkerMode,
    ),
  };
}

function readEnvFlag(env, key) {
  return typeof env?.[key] === 'string' ? env[key].trim() : '';
}

function isVmModeEnabled(env = process.env, runtimeModeEnv = null) {
  const envKeys = normalizeRuntimeModeEnvConfig(runtimeModeEnv);
  const rawValue = readEnvFlag(env, envKeys.vmMode);
  return rawValue === '1';
}

function isVmWorkerModeEnabled(env = process.env, runtimeModeEnv = null) {
  const envKeys = normalizeRuntimeModeEnvConfig(runtimeModeEnv);
  const rawValue = readEnvFlag(env, envKeys.vmWorkerMode);
  if (rawValue.length === 0) {
    return isVmModeEnabled(env, envKeys);
  }
  return rawValue === '1';
}

module.exports = {
  isVmModeEnabled,
  isVmWorkerModeEnabled,
};
