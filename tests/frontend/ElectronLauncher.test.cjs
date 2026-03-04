const path = require('path');

const {
  buildLaunchCommand,
  parseOptions,
  resolveCondaPythonPath,
} = require('../../frontend/scripts/electron-launcher.cjs');

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
});
