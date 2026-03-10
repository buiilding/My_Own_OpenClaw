/** @jest-environment node */

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('electron', () => ({
  app: { isPackaged: false },
}));

function withIsolatedRuntimePaths(testFn) {
  jest.isolateModules(() => {
    const fs = require('fs');
    const { app } = require('electron');
    const runtimePaths = require('../../frontend/src/main/runtime_paths.cjs');
    testFn({ fs, app, runtimePaths });
  });
}

describe('runtime_paths sidecar launch target resolution', () => {
  const originalResourcesPath = process.resourcesPath;
  const originalCondaPrefix = process.env.CONDA_PREFIX;
  const originalPlatform = process.platform;

  beforeEach(() => {
    process.resourcesPath = '/opt/WindieOS/resources';
    delete process.env.WINDIE_PYTHON_PATH;
    delete process.env.CONDA_PREFIX;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.resourcesPath = originalResourcesPath;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    if (typeof originalCondaPrefix === 'string') {
      process.env.CONDA_PREFIX = originalCondaPrefix;
    } else {
      delete process.env.CONDA_PREFIX;
    }
  });

  test('prefers packaged sidecar binary when present', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = true;
      const binaryPath = process.platform === 'win32'
        ? '/opt/WindieOS/resources/sidecar-bin/local_backend.exe'
        : '/opt/WindieOS/resources/sidecar-bin/local_backend';
      fs.existsSync.mockImplementation((candidate) => candidate === binaryPath);

      const target = runtimePaths.resolveSidecarLaunchTarget('local_backend.py');

      expect(target.kind).toBe('binary');
      expect(target.command).toBe(binaryPath);
      expect(target.args).toEqual([]);
      expect(target.resolvedPath).toBe(binaryPath);
    });
  });

  test('falls back to runtime sidecar bytecode when binary is unavailable', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = true;
      const sidecarPyc = '/opt/WindieOS/resources/python-runtime/sidecar/local_backend.pyc';
      const runtimePython = process.platform === 'win32'
        ? '/opt/WindieOS/resources/python-runtime/python.exe'
        : '/opt/WindieOS/resources/python-runtime/bin/python3';
      fs.existsSync.mockImplementation((candidate) => (
        candidate === sidecarPyc
        || candidate === runtimePython
      ));

      const target = runtimePaths.resolveSidecarLaunchTarget('local_backend.py');

      expect(target.kind).toBe('python');
      expect(target.command).toBe(runtimePython);
      expect(target.args).toEqual([sidecarPyc]);
      expect(target.resolvedPath).toBe(sidecarPyc);
    });
  });

  test('packaged mode does not fall back to legacy app.asar python source paths', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = true;
      const runtimePython = process.platform === 'win32'
        ? '/opt/WindieOS/resources/python-runtime/python.exe'
        : '/opt/WindieOS/resources/python-runtime/bin/python3';
      fs.existsSync.mockImplementation((candidate) => candidate === runtimePython);

      const target = runtimePaths.resolveSidecarLaunchTarget('local_backend.py');

      expect(target.kind).toBe('python');
      expect(target.resolvedPath).toBe('/opt/WindieOS/resources/python-runtime/sidecar/local_backend.pyc');
      expect(target.args).toEqual(['/opt/WindieOS/resources/python-runtime/sidecar/local_backend.pyc']);
    });
  });

  test('packaged Windows resolves bundled venv interpreter under Scripts/python.exe', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    try {
      withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
        app.isPackaged = true;
        const sidecarPyc = '/opt/WindieOS/resources/python-runtime/sidecar/local_backend.pyc';
        const runtimePython = '/opt/WindieOS/resources/python-runtime/Scripts/python.exe';
        fs.existsSync.mockImplementation((candidate) => (
          candidate === sidecarPyc
          || candidate === runtimePython
        ));

        const target = runtimePaths.resolveSidecarLaunchTarget('local_backend.py');

        expect(target.kind).toBe('python');
        expect(target.command).toBe(runtimePython);
        expect(target.args).toEqual([sidecarPyc]);
        expect(target.resolvedPath).toBe(sidecarPyc);
      });
    } finally {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  test('packaged mode never falls back to external conda/python executables', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = true;
      process.env.CONDA_PREFIX = '/opt/conda/envs/windie';
      const sidecarPyc = '/opt/WindieOS/resources/python-runtime/sidecar/local_backend.pyc';
      const condaPython = process.platform === 'win32'
        ? '/opt/conda/envs/windie/python.exe'
        : '/opt/conda/envs/windie/bin/python3';
      fs.existsSync.mockImplementation((candidate) => (
        candidate === sidecarPyc
        || candidate === condaPython
      ));

      const target = runtimePaths.resolveSidecarLaunchTarget('local_backend.py');

      expect(target.kind).toBe('python');
      expect(target.command).toBe(null);
      expect(target.args).toEqual([sidecarPyc]);
      expect(target.resolvedPath).toBe(sidecarPyc);
    });
  });

  test('uses development source path when app is not packaged', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = false;
      const devScriptPath = '/repo/frontend/src/main/python/local_backend.py';
      fs.existsSync.mockImplementation((candidate) => (
        candidate.endsWith('/src/main/python/local_backend.py')
        || candidate === devScriptPath
      ));

      const target = runtimePaths.resolveSidecarLaunchTarget('local_backend.py');

      expect(target.kind).toBe('python');
      expect(target.resolvedPath.endsWith('/src/main/python/local_backend.py')).toBe(true);
    });
  });
});
