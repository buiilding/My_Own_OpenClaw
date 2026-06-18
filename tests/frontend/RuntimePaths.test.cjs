/** @jest-environment node */

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('electron', () => ({
  app: { isPackaged: false },
}));

const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

function withIsolatedRuntimePaths(testFn) {
  jest.isolateModules(() => {
    const fs = require('fs');
    const { app } = require('electron');
    const runtimePaths = require('../../frontend/src/main/app/runtime_paths.cjs');
    testFn({ fs, app, runtimePaths });
  });
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function samePath(actual, expected) {
  return toPosixPath(actual) === expected;
}

function expectPath(actual, expected) {
  expect(toPosixPath(actual)).toBe(expected);
}

function expectPathArray(actual, expected) {
  expect((actual || []).map(toPosixPath)).toEqual(expected);
}

describe('runtime_paths local runtime launch target resolution', () => {
  const originalResourcesPath = process.resourcesPath;
  const originalCondaPrefix = process.env.CONDA_PREFIX;
  const originalAgentPythonPath = process.env.AGENT_PYTHON_PATH;
  const originalWindiePythonPath = process.env.WINDIE_PYTHON_PATH;
  const originalPlatform = process.platform;

  beforeEach(() => {
    process.resourcesPath = '/opt/WindieOS/resources';
    delete process.env.WINDIE_PYTHON_PATH;
    delete process.env.AGENT_PYTHON_PATH;
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
    if (typeof originalAgentPythonPath === 'string') {
      process.env.AGENT_PYTHON_PATH = originalAgentPythonPath;
    } else {
      delete process.env.AGENT_PYTHON_PATH;
    }
    if (typeof originalWindiePythonPath === 'string') {
      process.env.WINDIE_PYTHON_PATH = originalWindiePythonPath;
    } else {
      delete process.env.WINDIE_PYTHON_PATH;
    }
  });

  test('does not export the retired sidecar-named launch resolver', () => {
    withIsolatedRuntimePaths(({ runtimePaths }) => {
      expect(runtimePaths.resolveSidecarLaunchTarget).toBeUndefined();
      expect(typeof runtimePaths.resolveLocalRuntimeLaunchTarget).toBe('function');
    });
  });

  test('uses generic Python path env by default', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = false;
      process.env.AGENT_PYTHON_PATH = '/opt/agent/python3';
      fs.existsSync.mockImplementation((candidate) => (
        samePath(candidate, '/opt/agent/python3')
        || toPosixPath(candidate).endsWith('/src/main/python/sidecar_daemon.py')
      ));

      const target = runtimePaths.resolveLocalRuntimeLaunchTarget('sidecar_daemon.py');

      expectPath(target.command, '/opt/agent/python3');
    });
  });

  test('uses configured host Python path env when supplied', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = false;
      process.env.WINDIE_PYTHON_PATH = '/opt/windie/python3';
      fs.existsSync.mockImplementation((candidate) => (
        samePath(candidate, '/opt/windie/python3')
        || toPosixPath(candidate).endsWith('/src/main/python/sidecar_daemon.py')
      ));

      const target = runtimePaths.resolveLocalRuntimeLaunchTarget('sidecar_daemon.py', {
        runtimePathEnv: {
          pythonPath: 'WINDIE_PYTHON_PATH',
        },
      });

      expectPath(target.command, '/opt/windie/python3');
    });
  });

  test('resolves packaged daemon bytecode through bundled Python', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = true;
      const localRuntimePyc = '/opt/WindieOS/resources/python-runtime/local-runtime/sidecar_daemon.pyc';
      const runtimePython = process.platform === 'win32'
        ? '/opt/WindieOS/resources/python-runtime/python.exe'
        : '/opt/WindieOS/resources/python-runtime/bin/python3';
      fs.existsSync.mockImplementation((candidate) => (
        samePath(candidate, localRuntimePyc)
        || samePath(candidate, runtimePython)
      ));

      const target = runtimePaths.resolveLocalRuntimeLaunchTarget('sidecar_daemon.py');

      expect(target.kind).toBe('python');
      expectPath(target.command, runtimePython);
      expectPathArray(target.args, [localRuntimePyc]);
      expectPath(target.resolvedPath, localRuntimePyc);
    });
  });

  test('uses configured host packaged entrypoint directory for WindieOS compatibility', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = true;
      const sidecarPyc = '/opt/WindieOS/resources/python-runtime/sidecar/sidecar_daemon.pyc';
      const runtimePython = process.platform === 'win32'
        ? '/opt/WindieOS/resources/python-runtime/python.exe'
        : '/opt/WindieOS/resources/python-runtime/bin/python3';
      fs.existsSync.mockImplementation((candidate) => (
        samePath(candidate, sidecarPyc)
        || samePath(candidate, runtimePython)
      ));

      const target = runtimePaths.resolveLocalRuntimeLaunchTarget('sidecar_daemon.py', {
        runtimePaths: mainHostSkin.runtimePaths,
      });

      expect(target.kind).toBe('python');
      expectPath(target.command, runtimePython);
      expectPathArray(target.args, [sidecarPyc]);
      expectPath(target.resolvedPath, sidecarPyc);
    });
  });

  test('packaged mode does not fall back to legacy app.asar python source paths', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = true;
      const runtimePython = process.platform === 'win32'
        ? '/opt/WindieOS/resources/python-runtime/python.exe'
        : '/opt/WindieOS/resources/python-runtime/bin/python3';
      fs.existsSync.mockImplementation((candidate) => samePath(candidate, runtimePython));

      const target = runtimePaths.resolveLocalRuntimeLaunchTarget('sidecar_daemon.py');

      expect(target.kind).toBe('python');
      expectPath(target.resolvedPath, '/opt/WindieOS/resources/python-runtime/local-runtime/sidecar_daemon.pyc');
      expectPathArray(target.args, ['/opt/WindieOS/resources/python-runtime/local-runtime/sidecar_daemon.pyc']);
    });
  });

  test('rejects extensionless local runtime service names', () => {
    withIsolatedRuntimePaths(({ app, runtimePaths }) => {
      app.isPackaged = true;

      expect(() => runtimePaths.resolveLocalRuntimeLaunchTarget('sidecar_daemon'))
        .toThrow('Local runtime launch target must be a Python entrypoint');
      expect(() => runtimePaths.resolveLocalRuntimeLaunchTarget('../sidecar_daemon.py'))
        .toThrow('Local runtime launch target must be a Python entrypoint');
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
        const localRuntimePyc = '/opt/WindieOS/resources/python-runtime/local-runtime/sidecar_daemon.pyc';
        const runtimePython = '/opt/WindieOS/resources/python-runtime/Scripts/python.exe';
        fs.existsSync.mockImplementation((candidate) => (
          samePath(candidate, localRuntimePyc)
          || samePath(candidate, runtimePython)
        ));

        const target = runtimePaths.resolveLocalRuntimeLaunchTarget('sidecar_daemon.py');

        expect(target.kind).toBe('python');
        expectPath(target.command, runtimePython);
        expectPathArray(target.args, [localRuntimePyc]);
        expectPath(target.resolvedPath, localRuntimePyc);
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
      const localRuntimePyc = '/opt/WindieOS/resources/python-runtime/local-runtime/wakeword_service.pyc';
      const condaPython = process.platform === 'win32'
        ? '/opt/conda/envs/windie/python.exe'
        : '/opt/conda/envs/windie/bin/python3';
      fs.existsSync.mockImplementation((candidate) => (
        samePath(candidate, localRuntimePyc)
        || samePath(candidate, condaPython)
      ));

      const target = runtimePaths.resolveLocalRuntimeLaunchTarget('wakeword_service.py');

      expect(target.kind).toBe('python');
      expect(target.command).toBe(null);
      expectPathArray(target.args, [localRuntimePyc]);
      expectPath(target.resolvedPath, localRuntimePyc);
    });
  });

  test('uses development source path when app is not packaged', () => {
    withIsolatedRuntimePaths(({ fs, app, runtimePaths }) => {
      app.isPackaged = false;
      const devScriptPath = '/repo/frontend/src/main/python/sidecar_daemon.py';
      fs.existsSync.mockImplementation((candidate) => (
        toPosixPath(candidate).endsWith('/src/main/python/sidecar_daemon.py')
        || samePath(candidate, devScriptPath)
      ));

      const target = runtimePaths.resolveLocalRuntimeLaunchTarget('sidecar_daemon.py');

      expect(target.kind).toBe('python');
      expect(toPosixPath(target.resolvedPath).endsWith('/src/main/python/sidecar_daemon.py')).toBe(true);
    });
  });
});
