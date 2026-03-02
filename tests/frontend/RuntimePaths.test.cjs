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

  beforeEach(() => {
    process.resourcesPath = '/opt/WindieOS/resources';
    delete process.env.WINDIE_PYTHON_PATH;
    delete process.env.CONDA_PREFIX;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.resourcesPath = originalResourcesPath;
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

  test('uses development source path when app is not packaged', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = false;
      const devScriptPath = '/repo/frontend/src/main/python/local_backend.py';
      fs.existsSync.mockImplementation((candidate) => (
        candidate.endsWith('/src/main/python/local_backend.py')
        || candidate === devScriptPath
      ));

      const scriptPath = runtimePaths.resolvePythonScriptPath('local_backend.py');

      expect(scriptPath.endsWith('/src/main/python/local_backend.py')).toBe(true);
    });
  });
});
