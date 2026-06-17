/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createDesktopLocalRuntimeLaunchPlan,
  createDesktopAutoSidecarLaunchPlan,
} = require('../../frontend/src/main/sidecar/sdk_sidecar_launch_options.cjs');
const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

describe('sdk local runtime launch options', () => {
  test('keeps the legacy auto-sidecar export as a local runtime launch alias', () => {
    expect(createDesktopAutoSidecarLaunchPlan).toBe(createDesktopLocalRuntimeLaunchPlan);
  });

  test('uses host skin copy for packaged missing Python guidance', () => {
    const plan = createDesktopLocalRuntimeLaunchPlan({
      isPackaged: true,
      copy: mainHostSkin.bundledRuntime,
      resolveLaunchTarget: () => ({ kind: 'python', command: null }),
    });

    expect(plan.ok).toBe(false);
    expect(plan.error)
      .toBe('Bundled Python runtime not found in app resources. Please reinstall WindieOS.');
  });

  test('uses generic packaged missing Python fallback without host skin copy', () => {
    const plan = createDesktopLocalRuntimeLaunchPlan({
      isPackaged: true,
      resolveLaunchTarget: () => ({ kind: 'python', command: null }),
    });

    expect(plan.ok).toBe(false);
    expect(plan.error)
      .toBe('Bundled Python runtime not found in app resources. Please reinstall this app.');
  });

  test('includes source identity in daemon launch context', () => {
    const plan = createDesktopLocalRuntimeLaunchPlan({
      backendEndpoints: { httpUrl: 'https://api.windieos.com' },
    });

    expect(plan.ok).toBe(true);
    expect(plan.options.launchContext.WINDIE_SIDECAR_SOURCE_PATH).toBe(plan.launchTarget.resolvedPath);
    expect(plan.options.launchContext.WINDIE_SIDECAR_SOURCE_STAMP).toContain('sidecar_daemon.py:');
    expect(plan.options.launchContext.WINDIE_SIDECAR_SOURCE_STAMP).toContain('local_backend.py:');
    expect(plan.options.launchContext.WINDIE_SIDECAR_SOURCE_STAMP)
      .toContain('local_backend_memory_handlers.py:');
  });

  test('desktop launch owns a fresh sidecar instead of reusing discovered daemons', () => {
    const plan = createDesktopLocalRuntimeLaunchPlan({
      backendEndpoints: { httpUrl: 'https://api.windieos.com' },
    });

    expect(plan.ok).toBe(true);
    expect(plan.options.reuseExisting).toBe(false);
    expect(typeof plan.options.onProcessSpawn).toBe('function');
    expect(typeof plan.options.onStdoutLine).toBe('function');
    expect(typeof plan.options.onStderrLine).toBe('function');
  });

  test('desktop launch uses a generic daemon discovery path by default', () => {
    const plan = createDesktopLocalRuntimeLaunchPlan({
      backendEndpoints: { httpUrl: 'https://api.windieos.com' },
    });

    expect(plan.ok).toBe(true);
    expect(plan.options.discoveryFile).toBe(
      path.join(os.tmpdir(), 'desktop-agent', 'sidecar-daemon.json'),
    );
  });

  test('sidecar daemon lines write to sidecar log layer and stderr stream', () => {
    const originalEnv = process.env;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-sidecar-log-'));
    const logFile = path.join(tempDir, 'sidecar.log');
    const stderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      process.env = {
        ...originalEnv,
        WINDIE_SIDECAR_LOG_FILE: logFile,
      };
      const plan = createDesktopLocalRuntimeLaunchPlan({
        backendEndpoints: { httpUrl: 'https://api.windieos.com' },
      });

      expect(plan.ok).toBe(true);
      plan.options.onStdoutLine('daemon ready');
      plan.options.onStdoutLine('[LocalSidecar] ready');
      plan.options.onStdoutLine('[LocalBackend] legacy ready');
      plan.options.onStderrLine('[SidecarDaemon] listening pid=123');

      expect(stderrWrite).toHaveBeenCalledWith('[SidecarDaemon] daemon ready\n');
      expect(stderrWrite).toHaveBeenCalledWith('[LocalSidecar] ready\n');
      expect(stderrWrite).toHaveBeenCalledWith('[LocalBackend] legacy ready\n');
      expect(stderrWrite).toHaveBeenCalledWith('[SidecarDaemon] listening pid=123\n');
      const log = fs.readFileSync(logFile, 'utf8');
      expect(log).toContain('[SidecarDaemon] daemon ready');
      expect(log).toContain('[LocalSidecar] ready');
      expect(log).toContain('[LocalBackend] legacy ready');
      expect(log).toContain('[SidecarDaemon] listening pid=123');
    } finally {
      stderrWrite.mockRestore();
      process.env = originalEnv;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('process spawn events write generic local runtime launch logs', () => {
    const originalEnv = process.env;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-main-log-'));
    const logFile = path.join(tempDir, 'main.log');

    try {
      process.env = {
        ...originalEnv,
        WINDIE_MAIN_LOG_FILE: logFile,
      };
      const plan = createDesktopLocalRuntimeLaunchPlan({
        backendEndpoints: { httpUrl: 'https://api.windieos.com' },
      });

      expect(plan.ok).toBe(true);
      plan.options.onProcessSpawn({
        command: 'python',
        cwd: 'C:\\work',
      });

      const log = fs.readFileSync(logFile, 'utf8');
      expect(log).toContain(
        '[Main][LocalRuntimeLaunch] spawned local runtime command="python" cwd="C:\\\\work"',
      );
      expect(log).not.toContain('[Main][SidecarBridge] spawned sidecar daemon');
    } finally {
      process.env = originalEnv;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
