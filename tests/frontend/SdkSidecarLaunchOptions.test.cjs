/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DAEMON_LAUNCH_CONTEXT_ENV_KEYS,
  buildSidecarDaemonEnv,
  buildSidecarLaunchContextFromEnv,
} = require('../../frontend/src/main/sidecar/sdk_sidecar_launch_options.cjs');

describe('sdk sidecar launch options', () => {
  test('includes source identity in daemon launch context', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-sidecar-source-'));
    try {
      for (const fileName of [
        'sidecar_daemon.py',
        'local_backend.py',
        'local_backend_memory_handlers.py',
      ]) {
        fs.writeFileSync(path.join(tempDir, fileName), `${fileName}\n`);
      }
      const launchTarget = {
        resolvedPath: path.join(tempDir, 'sidecar_daemon.py'),
      };
      const env = buildSidecarDaemonEnv({
        backendEndpoints: { httpUrl: 'https://api.windieos.com' },
        launchTarget,
      });
      const context = buildSidecarLaunchContextFromEnv(env);

      expect(DAEMON_LAUNCH_CONTEXT_ENV_KEYS).toEqual(expect.arrayContaining([
        'WINDIE_SIDECAR_SOURCE_PATH',
        'WINDIE_SIDECAR_SOURCE_STAMP',
      ]));
      expect(context.WINDIE_SIDECAR_SOURCE_PATH).toBe(launchTarget.resolvedPath);
      expect(context.WINDIE_SIDECAR_SOURCE_STAMP).toContain('sidecar_daemon.py:');
      expect(context.WINDIE_SIDECAR_SOURCE_STAMP).toContain('local_backend.py:');
      expect(context.WINDIE_SIDECAR_SOURCE_STAMP).toContain('local_backend_memory_handlers.py:');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
