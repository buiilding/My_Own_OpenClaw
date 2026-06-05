const fs = require('fs');

const {
  resolveBackendEndpoints,
} = require('./backend_endpoints.cjs');
const {
  withLocalBackendNodeOptions,
} = require('./local_backend_bridge_utils.cjs');
const {
  resolveSidecarLaunchTarget,
} = require('./runtime_paths.cjs');

function resolvePermissionStatePath(options = {}) {
  return typeof options.permissionStatePath === 'string'
    ? options.permissionStatePath.trim()
    : '';
}

function createMissingCommandError({ isPackaged }) {
  return isPackaged === true
    ? (
      'Bundled Python runtime not found in app resources. ' +
      'Please reinstall WindieOS.'
    )
    : (
      'Python executable not found. ' +
      'Please install Python 3 or set WINDIE_PYTHON_PATH.'
    );
}

function buildLocalBackendEnv({
  backendEndpoints,
  env = process.env,
  launchTarget,
  options = {},
  platform = process.platform,
} = {}) {
  const packagedApp = options.isPackaged === true;
  const permissionStatePath = resolvePermissionStatePath(options);
  const backendEnv = withLocalBackendNodeOptions({
    ...env,
    PYTHONUNBUFFERED: '1',
    WINDIE_BACKEND_HTTP_URL: backendEndpoints.httpUrl,
    ...(typeof options.authStatePath === 'string' && options.authStatePath.trim()
      ? { WINDIE_BACKEND_AUTH_STATE_PATH: options.authStatePath.trim() }
      : {}),
    WINDIE_PACKAGED_APP: packagedApp ? '1' : '0',
    WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: packagedApp ? '0' : '1',
    ...(permissionStatePath ? { WINDIE_PERMISSION_STATE_PATH: permissionStatePath } : {}),
    ...(
      packagedApp
      && launchTarget.kind === 'python'
        ? {
            PYTHONDONTWRITEBYTECODE: '1',
            ...(
              platform !== 'win32'
              && launchTarget.runtimeRoot
                ? {
                    PYTHONHOME: launchTarget.runtimeRoot,
                    PYTHONNOUSERSITE: '1',
                  }
                : {}
            ),
          }
        : {}
    ),
  });

  if (packagedApp && launchTarget.kind === 'python') {
    delete backendEnv.PYTHONPATH;
  }

  return backendEnv;
}

function createLocalBackendLaunchPlan({
  env = process.env,
  options = {},
  pathExists = fs.existsSync,
  platform = process.platform,
  resolveBackendEndpointsFn = resolveBackendEndpoints,
  resolveLaunchTarget = resolveSidecarLaunchTarget,
} = {}) {
  const launchTarget = resolveLaunchTarget('local_backend.py');
  const packagedApp = options.isPackaged === true;

  if (launchTarget.kind === 'python' && !launchTarget.command) {
    return {
      ok: false,
      error: createMissingCommandError({ isPackaged: packagedApp }),
      launchTarget,
      logPrefix: '[LocalBackend]',
    };
  }

  if (launchTarget.kind === 'python' && !pathExists(launchTarget.resolvedPath)) {
    return {
      ok: false,
      error: `Local backend script not found: ${launchTarget.resolvedPath}`,
      launchTarget,
      logPrefix: '[LocalBackend]',
    };
  }

  const backendEndpoints = options.backendEndpoints || resolveBackendEndpointsFn(env, {
    isPackaged: packagedApp,
  });
  const backendEnv = buildLocalBackendEnv({
    backendEndpoints,
    env,
    launchTarget,
    options,
    platform,
  });

  return {
    ok: true,
    backendEndpoints,
    command: launchTarget.command,
    args: launchTarget.args,
    launchTarget,
    spawnOptions: {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: launchTarget.cwd,
      env: backendEnv,
    },
  };
}

module.exports = {
  buildLocalBackendEnv,
  createLocalBackendLaunchPlan,
  createMissingCommandError,
};
