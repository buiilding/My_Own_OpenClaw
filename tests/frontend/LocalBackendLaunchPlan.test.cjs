/** @jest-environment node */

const {
  buildLocalBackendEnv,
  createLocalBackendLaunchPlan,
  createMissingCommandError,
} = require('../../frontend/src/main/sidecar/local_backend_launch_plan.cjs');

describe('local backend launch plan', () => {
  const pythonLaunchTarget = {
    kind: 'python',
    command: '/runtime/bin/python3',
    args: ['/runtime/sidecar/local_backend.pyc'],
    cwd: '/runtime/sidecar',
    resolvedPath: '/runtime/sidecar/local_backend.pyc',
    runtimeRoot: '/runtime',
  };

  test('returns packaged reinstall guidance when bundled Python is missing', () => {
    expect(createMissingCommandError({ isPackaged: true })).toBe(
      'Bundled Python runtime not found in app resources. Please reinstall WindieOS.',
    );
  });

  test('builds packaged Unix Python env with runtime isolation', () => {
    const env = buildLocalBackendEnv({
      backendEndpoints: { httpUrl: 'https://backend.example' },
      env: {
        NODE_OPTIONS: '--trace-warnings',
        PYTHONPATH: '/should/remove',
      },
      launchTarget: pythonLaunchTarget,
      options: {
        isPackaged: true,
        authStatePath: ' C:/auth/state.json ',
        permissionStatePath: ' C:/permission/state.json ',
      },
      platform: 'linux',
    });

    expect(env).toEqual(expect.objectContaining({
      NODE_OPTIONS: '--trace-warnings --no-deprecation',
      PYTHONUNBUFFERED: '1',
      WINDIE_BACKEND_HTTP_URL: 'https://backend.example',
      WINDIE_BACKEND_AUTH_STATE_PATH: 'C:/auth/state.json',
      WINDIE_PERMISSION_STATE_PATH: 'C:/permission/state.json',
      WINDIE_PACKAGED_APP: '1',
      WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: '0',
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONHOME: '/runtime',
      PYTHONNOUSERSITE: '1',
    }));
    expect(env.PYTHONPATH).toBeUndefined();
  });

  test('builds packaged Windows Python env without PYTHONHOME', () => {
    const env = buildLocalBackendEnv({
      backendEndpoints: { httpUrl: 'https://backend.example' },
      env: {},
      launchTarget: pythonLaunchTarget,
      options: { isPackaged: true },
      platform: 'win32',
    });

    expect(env).toEqual(expect.objectContaining({
      WINDIE_PACKAGED_APP: '1',
      WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: '0',
      PYTHONDONTWRITEBYTECODE: '1',
    }));
    expect(env.PYTHONHOME).toBeUndefined();
    expect(env.PYTHONNOUSERSITE).toBeUndefined();
  });

  test('returns spawn plan when launch target and script are available', () => {
    const plan = createLocalBackendLaunchPlan({
      env: {},
      options: { isPackaged: true },
      pathExists: () => true,
      resolveBackendEndpointsFn: () => ({ httpUrl: 'https://backend.example' }),
      resolveLaunchTarget: () => pythonLaunchTarget,
    });

    expect(plan).toEqual(expect.objectContaining({
      ok: true,
      command: '/runtime/bin/python3',
      args: ['/runtime/sidecar/local_backend.pyc'],
      backendEndpoints: { httpUrl: 'https://backend.example' },
      spawnOptions: expect.objectContaining({
        cwd: '/runtime/sidecar',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    }));
    expect(plan.spawnOptions.env.WINDIE_BACKEND_HTTP_URL).toBe('https://backend.example');
  });

  test('returns script-missing plan before spawn options are built', () => {
    const plan = createLocalBackendLaunchPlan({
      env: {},
      options: { isPackaged: false },
      pathExists: () => false,
      resolveLaunchTarget: () => pythonLaunchTarget,
    });

    expect(plan).toEqual(expect.objectContaining({
      ok: false,
      error: 'Local backend script not found: /runtime/sidecar/local_backend.pyc',
      launchTarget: pythonLaunchTarget,
    }));
  });
});
