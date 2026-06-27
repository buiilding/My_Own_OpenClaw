/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  commandForPlatform,
  runConcurrent,
} = require('../../scripts/windie/run.cjs');

describe('windie concurrent runner layer logs', () => {
  test('routes shell scripts through bash on Windows', () => {
    const scriptPath = path.join(path.resolve(__dirname, '../..'), 'scripts/run-backend.sh');
    const resolved = commandForPlatform(scriptPath, ['--help']);

    if (process.platform === 'win32') {
      expect(resolved).toEqual({ command: 'bash.exe', args: [scriptPath, '--help'] });
    } else {
      expect(resolved).toEqual({ command: scriptPath, args: ['--help'] });
    }
  });

  test('routes cmd scripts through cmd on Windows', () => {
    const scriptPath = path.join(path.resolve(__dirname, '../..'), 'scripts/python-in-env.cmd');
    const resolved = commandForPlatform(scriptPath, ['frontend', 'node', '--version']);

    if (process.platform === 'win32') {
      expect(resolved).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', scriptPath, 'frontend', 'node', '--version'],
      });
    } else {
      expect(resolved).toEqual({ command: scriptPath, args: ['frontend', 'node', '--version'] });
    }
  });

  test('writes Vite child stdout and stderr to the Vite layer log', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-vite-run-log-'));
    const logFile = path.join(tempDir, 'vite.log');
    const previous = process.env.WINDIE_VITE_LOG_FILE;
    process.env.WINDIE_VITE_LOG_FILE = logFile;
    try {
      const code = await runConcurrent([
        {
          label: 'frontend',
          command: process.execPath,
          args: ['-e', 'console.log("vite stdout"); console.error("vite stderr");'],
          cwd: path.resolve(__dirname, '../..'),
          logLayer: 'vite',
        },
      ]);

      expect(code).toBe(0);
      const log = fs.readFileSync(logFile, 'utf8');
      expect(log).toContain('[WindieOS] frontend child process log session');
      expect(log).toContain('vite stdout');
      expect(log).toContain('vite stderr');
    } finally {
      if (typeof previous === 'string') {
        process.env.WINDIE_VITE_LOG_FILE = previous;
      } else {
        delete process.env.WINDIE_VITE_LOG_FILE;
      }
    }
  });
});
