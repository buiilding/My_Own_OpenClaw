/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  runConcurrent,
} = require('../../scripts/windie/run.cjs');

describe('windie concurrent runner layer logs', () => {
  test('writes Vite child stdout and stderr to the Vite layer log', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-vite-run-log-'));
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
