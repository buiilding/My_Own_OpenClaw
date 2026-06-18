/**
 * Coordinates the gpu runtime for the Electron main process.
 */

const DEFAULT_GPU_ENV = Object.freeze({
  forceSoftwareRendering: 'AGENT_FORCE_SOFTWARE_RENDERING',
});

function isTruthyEnv(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeEnvKey(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function resolveGpuEnvConfig(gpuEnv = {}) {
  return {
    forceSoftwareRendering: normalizeEnvKey(
      gpuEnv.forceSoftwareRendering,
      DEFAULT_GPU_ENV.forceSoftwareRendering,
    ),
  };
}

function shouldForceSoftwareRendering(env = process.env, gpuEnv = {}) {
  const envConfig = resolveGpuEnvConfig(gpuEnv);
  return isTruthyEnv(env[envConfig.forceSoftwareRendering]);
}

function configureGpuRuntime({ app, env = process.env, gpuEnv = {} } = {}) {
  if (!app || typeof app.disableHardwareAcceleration !== 'function') {
    return { softwareRenderingForced: false };
  }

  if (!shouldForceSoftwareRendering(env, gpuEnv)) {
    return { softwareRenderingForced: false };
  }

  app.disableHardwareAcceleration();
  env.LIBGL_ALWAYS_SOFTWARE = '1';
  env.GALLIUM_DRIVER = 'llvmpipe';
  return { softwareRenderingForced: true };
}

module.exports = {
  configureGpuRuntime,
  resolveGpuEnvConfig,
};
