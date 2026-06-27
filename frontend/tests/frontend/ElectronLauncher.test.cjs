/**
 * Covers electron launcher. behavior in the frontend test suite.
 */

const path = require('path');

const {
  buildLaunchCommand,
  buildLaunchEnv,
  parseOptions,
  pipeForwardedStdout,
  pipeFilteredStderr,
  resolveFrontendLogFile,
  resolveElectronBinaryForPlatform,
  resolveCondaPythonPath,
  shouldForwardElectronStderrLine,
} = require('../../scripts/electron-launcher.cjs');

describe('electron-launcher', () => {
  test('parseOptions reads launch flags', () => {
    const options = parseOptions([
      '--dev',
      '--no-summarizer',
      '--debug-ghost-overlay',
    ]);
    expect(options).toEqual({
      dev: true,
      noSummarizer: true,
      debugGhostOverlay: true,
    });
  });

  test('buildLaunchEnv enables developer UI without live surface trace noise', () => {
    const env = buildLaunchEnv({
      dev: true,
      noSummarizer: false,
      debugGhostOverlay: false,
    }, {});

    expect(env.WINDIE_DEV_UI).toBe('1');
    expect(env.WINDIE_DEBUG_LIVE_SURFACE).toBeUndefined();
    expect(env.ELECTRON_DISABLE_SANDBOX).toBe('1');
  });

  test('resolveFrontendLogFile defaults to the repo-local frontend log', () => {
    expect(resolveFrontendLogFile({})).toBe(
      path.resolve(__dirname, '../../.windie/logs/frontend.log'),
    );
  });

  test('resolveFrontendLogFile supports override and disabled values', () => {
    expect(resolveFrontendLogFile({ WINDIE_FRONTEND_LOG_FILE: '/tmp/agent-frontend.log' }))
      .toBe('/tmp/agent-frontend.log');
    expect(resolveFrontendLogFile({ WINDIE_FRONTEND_LOG_FILE: 'logs/frontend.log' }))
      .toBe(path.resolve(__dirname, '../../logs/frontend.log'));
    expect(resolveFrontendLogFile({ WINDIE_FRONTEND_LOG_FILE: '0' })).toBeNull();
    expect(resolveFrontendLogFile({ WINDIE_FRONTEND_LOG_FILE: 'false' })).toBeNull();
  });

  test('resolveCondaPythonPath returns null when WINDIE_PYTHON_PATH already set', () => {
    const resolved = resolveCondaPythonPath(
      {
        WINDIE_PYTHON_PATH: 'C:\\custom\\python.exe',
        CONDA_PREFIX: 'C:\\conda\\envs\\frontend_jarvis',
      },
      'win32',
      () => true,
    );
    expect(resolved).toBeNull();
  });

  test('resolveCondaPythonPath resolves windows conda python.exe', () => {
    const condaPrefix = 'C:\\conda\\envs\\frontend_jarvis';
    const expected = path.join(condaPrefix, 'python.exe');
    const resolved = resolveCondaPythonPath(
      {
        CONDA_PREFIX: condaPrefix,
      },
      'win32',
      (candidate) => candidate === expected,
    );
    expect(resolved).toBe(expected);
  });

  test('buildLaunchCommand wraps with xvfb-run on headless linux', () => {
    const launch = buildLaunchCommand({
      electronBinary: '/tmp/electron',
      platform: 'linux',
      env: {},
      xvfbAvailable: true,
    });
    expect(launch).toEqual({
      command: 'xvfb-run',
      args: ['-a', '/tmp/electron', '.'],
    });
  });

  test('buildLaunchCommand launches electron directly on linux when DISPLAY is set', () => {
    const launch = buildLaunchCommand({
      electronBinary: '/tmp/electron',
      platform: 'linux',
      env: { DISPLAY: ':0' },
      xvfbAvailable: true,
    });
    expect(launch).toEqual({
      command: '/tmp/electron',
      args: ['.'],
    });
  });

  test('buildLaunchCommand launches electron directly on headless linux when xvfb-run is unavailable', () => {
    const launch = buildLaunchCommand({
      electronBinary: '/tmp/electron',
      platform: 'linux',
      env: {},
      xvfbAvailable: false,
    });
    expect(launch).toEqual({
      command: '/tmp/electron',
      args: ['.'],
    });
  });

  test('buildLaunchCommand launches electron directly on windows', () => {
    const launch = buildLaunchCommand({
      electronBinary: 'C:\\bin\\electron.exe',
      platform: 'win32',
      env: {},
      xvfbAvailable: true,
    });
    expect(launch).toEqual({
      command: 'C:\\bin\\electron.exe',
      args: ['.'],
    });
  });

  test('resolveElectronBinaryForPlatform accepts .exe on windows', () => {
    const resolved = resolveElectronBinaryForPlatform(
      'C:\\bin\\electron.exe',
      { platform: 'win32', existsSync: () => false },
    );
    expect(resolved).toBe('C:\\bin\\electron.exe');
  });

  test('resolveElectronBinaryForPlatform swaps .exe for linux sibling when available', () => {
    const resolved = resolveElectronBinaryForPlatform(
      '/workspace/frontend/node_modules/electron/dist/electron.exe',
      {
        platform: 'linux',
        existsSync: (candidate) =>
          candidate === '/workspace/frontend/node_modules/electron/dist/electron',
      },
    );
    expect(resolved).toBe('/workspace/frontend/node_modules/electron/dist/electron');
  });

  test('resolveElectronBinaryForPlatform throws clear error when linux receives windows-only binary', () => {
    expect(() =>
      resolveElectronBinaryForPlatform(
        '/workspace/frontend/node_modules/electron/dist/electron.exe',
        { platform: 'linux', existsSync: () => false },
      ),
    ).toThrow(
      "Electron binary mismatch for platform 'linux': received Windows executable",
    );
  });

  test('resolveElectronBinaryForPlatform trims surrounding whitespace for valid paths', () => {
    const resolved = resolveElectronBinaryForPlatform('  /tmp/electron  ', {
      platform: 'linux',
      existsSync: () => false,
    });
    expect(resolved).toBe('/tmp/electron');
  });

  test('resolveElectronBinaryForPlatform rejects missing/blank binary paths', () => {
    expect(() =>
      resolveElectronBinaryForPlatform('', { platform: 'linux' }),
    ).toThrow('Electron binary path is missing or invalid.');
    expect(() =>
      resolveElectronBinaryForPlatform('   ', { platform: 'linux' }),
    ).toThrow('Electron binary path is missing or invalid.');
  });

  test('shouldForwardElectronStderrLine suppresses known chromium systemd scope warning on linux', () => {
    expect(shouldForwardElectronStderrLine(
      '[146193:0309/225916.534701:ERROR:dbus/object_proxy.cc:573] Failed to call method: ' +
        'org.freedesktop.systemd1.Manager.StartTransientUnit: object_path= /org/freedesktop/systemd1: ' +
        'org.freedesktop.systemd1.UnitExists: Unit app-org.chromium.Chromium-146193.scope was already loaded or has a fragment file.',
      'linux',
    )).toBe(false);
    expect(shouldForwardElectronStderrLine(
      '[146193:0309/225928.064159:ERROR:content/browser/gpu/gpu_process_host.cc:998] GPU process launch failed: error_code=1002',
      'linux',
    )).toBe(true);
  });

  test('shouldForwardElectronStderrLine suppresses the known macOS Chromium LaunchServices daemon warning', () => {
    expect(shouldForwardElectronStderrLine(
      '[53797:0310/170251.792364:ERROR:sandbox/mac/system_services.cc:35] SetApplicationIsDaemon: ' +
        'Error Domain=NSOSStatusErrorDomain Code=-50 "paramErr: error in user parameter list" (-50)',
      'darwin',
    )).toBe(false);
    expect(shouldForwardElectronStderrLine(
      '[53797:0310/170251.792364:ERROR:sandbox/mac/system_services.cc:35] other warning',
      'darwin',
    )).toBe(true);
  });

  test('pipeFilteredStderr forwards non-filtered lines and drops the known linux scope warning', () => {
    const handlers = {};
    const stream = {
      setEncoding: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const destination = {
      write: jest.fn(),
    };

    pipeFilteredStderr(stream, { destination, platform: 'linux' });

    handlers.data(
      '[146193:0309/225916.534701:ERROR:dbus/object_proxy.cc:573] Failed to call method: ' +
        'org.freedesktop.systemd1.Manager.StartTransientUnit: object_path= /org/freedesktop/systemd1: ' +
        'org.freedesktop.systemd1.UnitExists: Unit app-org.chromium.Chromium-146193.scope was already loaded or has a fragment file.\n' +
        '[146193:0309/225928.064159:ERROR:content/browser/gpu/gpu_process_host.cc:998] GPU process launch failed: error_code=1002\n',
    );

    expect(destination.write).toHaveBeenCalledTimes(1);
    expect(destination.write).toHaveBeenCalledWith(
      '[146193:0309/225928.064159:ERROR:content/browser/gpu/gpu_process_host.cc:998] GPU process launch failed: error_code=1002\n',
    );
  });

  test('pipeFilteredStderr mirrors forwarded stderr to the log destination', () => {
    const handlers = {};
    const stream = {
      setEncoding: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const destination = {
      write: jest.fn(),
    };
    const logDestination = {
      write: jest.fn(),
    };

    pipeFilteredStderr(stream, { destination, logDestination, platform: 'darwin' });

    handlers.data(
      '[53797:0310/170251.792364:ERROR:sandbox/mac/system_services.cc:35] SetApplicationIsDaemon: ' +
        'Error Domain=NSOSStatusErrorDomain Code=-50 "paramErr: error in user parameter list" (-50)\n' +
        '[Main] normal stderr line\n',
    );

    expect(destination.write).toHaveBeenCalledTimes(1);
    expect(logDestination.write).toHaveBeenCalledTimes(1);
    expect(logDestination.write).toHaveBeenCalledWith('[Main] normal stderr line\n');
  });

  test('pipeFilteredStderr drops the known macOS daemon warning and forwards adjacent lines', () => {
    const handlers = {};
    const stream = {
      setEncoding: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const destination = {
      write: jest.fn(),
    };

    pipeFilteredStderr(stream, { destination, platform: 'darwin' });

    handlers.data(
      '[53797:0310/170251.792364:ERROR:sandbox/mac/system_services.cc:35] SetApplicationIsDaemon: ' +
        'Error Domain=NSOSStatusErrorDomain Code=-50 "paramErr: error in user parameter list" (-50)\n' +
        '[Main] normal stderr line\n',
    );

    expect(destination.write).toHaveBeenCalledTimes(1);
    expect(destination.write).toHaveBeenCalledWith('[Main] normal stderr line\n');
  });

  test('pipeForwardedStdout forwards stdout chunks verbatim', () => {
    const handlers = {};
    const stream = {
      setEncoding: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const destination = {
      write: jest.fn(),
    };

    pipeForwardedStdout(stream, { destination });

    handlers.data('[Main] hello from electron\n');
    handlers.data('[IPC] more logs\n');

    expect(destination.write).toHaveBeenNthCalledWith(1, '[Main] hello from electron\n');
    expect(destination.write).toHaveBeenNthCalledWith(2, '[IPC] more logs\n');
  });

  test('pipeForwardedStdout mirrors stdout chunks to the log destination', () => {
    const handlers = {};
    const stream = {
      setEncoding: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const destination = {
      write: jest.fn(),
    };
    const logDestination = {
      write: jest.fn(),
    };

    pipeForwardedStdout(stream, { destination, logDestination });

    handlers.data('[Main] hello from electron\n');

    expect(destination.write).toHaveBeenCalledWith('[Main] hello from electron\n');
    expect(logDestination.write).toHaveBeenCalledWith('[Main] hello from electron\n');
  });
});
