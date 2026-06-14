/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DAEMON_LAUNCH_CONTEXT_ENV_KEYS,
  buildSidecarDaemonEnv,
  buildSidecarLaunchContextFromEnv,
  createDesktopAutoSidecarLaunchPlan,
  writeSidecarDaemonLogLine,
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

  test('desktop launch owns a fresh sidecar instead of reusing discovered daemons', () => {
    const plan = createDesktopAutoSidecarLaunchPlan({
      backendEndpoints: { httpUrl: 'https://api.windieos.com' },
    });

    expect(plan.ok).toBe(true);
    expect(plan.options.reuseExisting).toBe(false);
    expect(typeof plan.options.onProcessSpawn).toBe('function');
    expect(typeof plan.options.onStdoutLine).toBe('function');
    expect(typeof plan.options.onStderrLine).toBe('function');
  });

  test('sidecar daemon lines write to sidecar log layer and stderr stream', () => {
    const stream = { write: jest.fn() };
    const writeLayerLogLine = jest.fn();

    expect(writeSidecarDaemonLogLine('daemon ready', {
      filter: false,
      stream,
      writeLayerLogLine,
    })).toBe(true);

    expect(writeLayerLogLine).toHaveBeenCalledWith('sidecar', '[SidecarDaemon] daemon ready');
    expect(stream.write).toHaveBeenCalledWith('[SidecarDaemon] daemon ready\n');

    expect(writeSidecarDaemonLogLine('[LocalBackend] ready', {
      filter: false,
      stream,
      writeLayerLogLine,
    })).toBe(true);
    expect(writeLayerLogLine).toHaveBeenCalledWith('sidecar', '[LocalBackend] ready');

    expect(writeSidecarDaemonLogLine('[SidecarDaemon] listening pid=123', {
      stream,
      writeLayerLogLine,
    })).toBe(true);
    expect(writeLayerLogLine).toHaveBeenCalledWith('sidecar', '[SidecarDaemon] listening pid=123');
  });
});
