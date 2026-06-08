function isTruthyEnv(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function shouldForceSoftwareRendering(env = process.env) {
  return isTruthyEnv(env.WINDIE_FORCE_SOFTWARE_RENDERING);
}

function configureGpuRuntime({ app, env = process.env } = {}) {
  if (!app || typeof app.disableHardwareAcceleration !== 'function') {
    return { softwareRenderingForced: false };
  }

  if (!shouldForceSoftwareRendering(env)) {
    return { softwareRenderingForced: false };
  }

  app.disableHardwareAcceleration();
  env.LIBGL_ALWAYS_SOFTWARE = '1';
  env.GALLIUM_DRIVER = 'llvmpipe';
  return { softwareRenderingForced: true };
}

module.exports = {
  configureGpuRuntime,
};
