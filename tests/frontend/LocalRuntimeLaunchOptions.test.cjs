/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createDesktopLocalRuntimeLaunchPlan,
  resolveLocalRuntimeDaemonEnvConfig,
} = require('../../frontend/src/main/sidecar/local_runtime_launch_options.cjs');
const launchOptionsModule = require('../../frontend/src/main/sidecar/local_runtime_launch_options.cjs');
const localRuntimeUtilsModule = require('../../frontend/src/main/sidecar/local_runtime_utils.cjs');
const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

describe('desktop local runtime launch options', () => {
  test('removes the legacy auto-sidecar launch plan export', () => {
    expect(launchOptionsModule.createDesktopAutoSidecarLaunchPlan).toBeUndefined();
  });

  test('removes the legacy local-backend node options helper export', () => {
    expect(localRuntimeUtilsModule.withLocalBackendNodeOptions).toBeUndefined();
    expect(typeof localRuntimeUtilsModule.withLocalRuntimeNodeOptions).toBe('function');
  });

  test('uses generic local-runtime verbose stderr env flag without sidecar alias', () => {
    const debugLine = '2026-06-17 10:00:00 - DEBUG - noisy daemon detail';

    expect(localRuntimeUtilsModule.shouldForwardStderrLine(debugLine, {
      AGENT_VERBOSE_LOCAL_RUNTIME_STDERR: '1',
    })).toBe(true);
    expect(localRuntimeUtilsModule.shouldForwardStderrLine(debugLine, {
      WINDIE_VERBOSE_SIDECAR_STDERR: '1',
    })).toBe(false);
  });

  test('uses configured host verbose stderr env flag from local-runtime skin', () => {
    const debugLine = '2026-06-17 10:00:00 - DEBUG - noisy daemon detail';

    expect(localRuntimeUtilsModule.resolveLocalRuntimeEnvConfig()).toMatchObject({
      verboseStderr: 'AGENT_VERBOSE_LOCAL_RUNTIME_STDERR',
    });
    expect(localRuntimeUtilsModule.shouldForwardStderrLine(debugLine, {
      WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR: '1',
    })).toBe(false);
    expect(localRuntimeUtilsModule.shouldForwardStderrLine(debugLine, {
      WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR: '1',
    }, mainHostSkin.localRuntime.env)).toBe(true);
  });

  test('does not keep hard-coded Node deprecation stderr suppressors', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../frontend/src/main/sidecar/local_runtime_utils.cjs'),
      'utf8',
    );

    expect(source).not.toContain(['DEP', '0169'].join(''));
    expect(source).not.toContain(['trace', 'deprecation'].join('-'));
    expect(localRuntimeUtilsModule.shouldForwardStderrLine(
      'Warning: runtime dependency emitted an actionable warning',
    )).toBe(true);
  });

  test('uses local-runtime daemon helper names in launch source', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../frontend/src/main/sidecar/local_runtime_launch_options.cjs'),
      'utf8',
    );

    expect(source).toContain('buildLocalRuntimeDaemonEnv');
    expect(source).toContain('writeLocalRuntimeDaemonLogLine');
    expect(source).toContain('LOCAL_RUNTIME_SOURCE_STAMP_FILES');
    expect(source).toContain('resolveLocalRuntimeSourceStamp');
    expect(source).toContain('buildLocalRuntimeLaunchContextFromEnv');
    expect(source).toContain('AGENT_LOCAL_RUNTIME_SOURCE_PATH');
    expect(source).toContain('AGENT_LOCAL_RUNTIME_SOURCE_STAMP');
    expect(source).not.toContain('buildSidecarDaemonEnv');
    expect(source).not.toContain('writeSidecarDaemonLogLine');
    expect(source).not.toContain(['SIDECAR', 'SOURCE', 'STAMP', 'FILES'].join('_'));
    expect(source).not.toContain('WINDIE_SIDECAR_SOURCE_PATH');
    expect(source).not.toContain('WINDIE_SIDECAR_SOURCE_STAMP');
    expect(source).not.toContain('WINDIE_LOCAL_RUNTIME_SOURCE_PATH');
    expect(source).not.toContain('WINDIE_LOCAL_RUNTIME_SOURCE_STAMP');
    expect(source).not.toContain(['resolveSidecar', 'SourceStamp'].join(''));
    expect(source).not.toContain(['buildSidecar', 'LaunchContextFromEnv'].join(''));
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

  test('uses generic local-runtime Python guidance for dev missing command', () => {
    const plan = createDesktopLocalRuntimeLaunchPlan({
      isPackaged: false,
      resolveLaunchTarget: () => ({ kind: 'python', command: null }),
    });

    expect(plan.ok).toBe(false);
    expect(plan.error)
      .toBe('Python executable not found. Install Python 3 or set AGENT_PYTHON_PATH to the local-runtime Python executable.');
    expect(plan.error).not.toContain('frontend_jarvis');
  });

  test('uses configured host Python path env in dev missing command guidance', () => {
    const plan = createDesktopLocalRuntimeLaunchPlan({
      isPackaged: false,
      runtimePathEnv: mainHostSkin.runtimePaths.env,
      resolveLaunchTarget: () => ({ kind: 'python', command: null }),
    });

    expect(plan.ok).toBe(false);
    expect(plan.error)
      .toBe('Python executable not found. Install Python 3 or set WINDIE_PYTHON_PATH to the local-runtime Python executable.');
  });

  test('uses generic local-runtime wording for missing daemon script errors', () => {
    const missingScript = path.join(os.tmpdir(), 'desktop-runtime-missing-runtime.py');
    const plan = createDesktopLocalRuntimeLaunchPlan({
      resolveLaunchTarget: () => ({
        kind: 'python',
        command: 'python',
        resolvedPath: missingScript,
      }),
    });

    expect(plan.ok).toBe(false);
    expect(plan.error).toBe(`Local runtime daemon script not found: ${missingScript}`);
    expect(plan.error).not.toContain('Sidecar daemon script not found');
  });

  test('uses generic local-runtime daemon env defaults in launch context', () => {
    expect(resolveLocalRuntimeDaemonEnvConfig()).toMatchObject({
      backendHttpUrl: 'AGENT_BACKEND_HTTP_URL',
      backendAuthStatePath: 'AGENT_BACKEND_AUTH_STATE_PATH',
      packagedApp: 'AGENT_PACKAGED_APP',
      sourcePath: 'AGENT_LOCAL_RUNTIME_SOURCE_PATH',
      sourceStamp: 'AGENT_LOCAL_RUNTIME_SOURCE_STAMP',
    });
    const plan = createDesktopLocalRuntimeLaunchPlan({
      backendEndpoints: { httpUrl: 'https://api.windieos.com' },
    });

    expect(plan.ok).toBe(true);
    expect(plan.options.env.AGENT_BACKEND_HTTP_URL).toBe('https://api.windieos.com');
    expect(plan.options.env.AGENT_PACKAGED_APP).toBe('0');
    expect(plan.options.env.AGENT_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL).toBe('1');
    expect(plan.options.launchContext.AGENT_LOCAL_RUNTIME_SOURCE_PATH)
      .toBe(plan.launchTarget.resolvedPath);
    expect(plan.options.launchContext.AGENT_LOCAL_RUNTIME_SOURCE_STAMP)
      .toContain('sidecar_daemon.py:');
    expect(plan.options.launchContext.AGENT_LOCAL_RUNTIME_SOURCE_STAMP)
      .toContain('local_backend.py:');
    expect(plan.options.launchContext.AGENT_LOCAL_RUNTIME_SOURCE_STAMP)
      .toContain('local_backend_memory_handlers.py:');
    expect(plan.options.launchContext.WINDIE_LOCAL_RUNTIME_SOURCE_PATH).toBeUndefined();
    expect(plan.options.launchContext.WINDIE_LOCAL_RUNTIME_SOURCE_STAMP).toBeUndefined();
    expect(plan.options.launchContext.WINDIE_SIDECAR_SOURCE_PATH).toBeUndefined();
    expect(plan.options.launchContext.WINDIE_SIDECAR_SOURCE_STAMP).toBeUndefined();
  });

  test('uses configured host local-runtime daemon env keys in launch context', () => {
    const originalSemanticSummarizer = process.env.WINDIE_ENABLE_SEMANTIC_SUMMARIZER;
    const originalAgentSemanticSummarizer = process.env.AGENT_ENABLE_SEMANTIC_SUMMARIZER;
    let plan;
    try {
      process.env.WINDIE_ENABLE_SEMANTIC_SUMMARIZER = '0';
      process.env.AGENT_ENABLE_SEMANTIC_SUMMARIZER = '1';
      plan = createDesktopLocalRuntimeLaunchPlan({
        backendEndpoints: { httpUrl: 'https://api.windieos.com' },
        localRuntimeEnv: mainHostSkin.localRuntime.env,
        authStatePath: '/tmp/auth.json',
        permissionStatePath: '/tmp/permissions.json',
      });
    } finally {
      if (typeof originalSemanticSummarizer === 'string') {
        process.env.WINDIE_ENABLE_SEMANTIC_SUMMARIZER = originalSemanticSummarizer;
      } else {
        delete process.env.WINDIE_ENABLE_SEMANTIC_SUMMARIZER;
      }
      if (typeof originalAgentSemanticSummarizer === 'string') {
        process.env.AGENT_ENABLE_SEMANTIC_SUMMARIZER = originalAgentSemanticSummarizer;
      } else {
        delete process.env.AGENT_ENABLE_SEMANTIC_SUMMARIZER;
      }
    }

    expect(plan.ok).toBe(true);
    expect(plan.options.env.AGENT_BACKEND_HTTP_URL).toBe('https://api.windieos.com');
    expect(plan.options.env.AGENT_BACKEND_AUTH_STATE_PATH).toBe('/tmp/auth.json');
    expect(plan.options.env.AGENT_ENABLE_SEMANTIC_SUMMARIZER).toBe('0');
    expect(plan.options.env.AGENT_PACKAGED_APP).toBe('0');
    expect(plan.options.env.AGENT_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL).toBe('1');
    expect(plan.options.env.AGENT_PERMISSION_STATE_PATH).toBe('/tmp/permissions.json');
    expect(plan.options.env.WINDIE_BACKEND_HTTP_URL).toBe('https://api.windieos.com');
    expect(plan.options.env.WINDIE_BACKEND_AUTH_STATE_PATH).toBe('/tmp/auth.json');
    expect(plan.options.env.WINDIE_ENABLE_SEMANTIC_SUMMARIZER).toBe('0');
    expect(plan.options.env.WINDIE_PERMISSION_STATE_PATH).toBe('/tmp/permissions.json');
    expect(plan.options.env.WINDIE_PACKAGED_APP).toBe('0');
    expect(plan.options.env.WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL).toBe('1');
    expect(plan.options.launchContext.WINDIE_BACKEND_HTTP_URL).toBe('https://api.windieos.com');
    expect(plan.options.launchContext.WINDIE_BACKEND_AUTH_STATE_PATH).toBe('/tmp/auth.json');
    expect(plan.options.launchContext.WINDIE_LOCAL_RUNTIME_SOURCE_PATH)
      .toBe(plan.launchTarget.resolvedPath);
    expect(plan.options.launchContext.WINDIE_LOCAL_RUNTIME_SOURCE_STAMP)
      .toContain('sidecar_daemon.py:');
    expect(plan.options.launchContext.AGENT_LOCAL_RUNTIME_SOURCE_PATH).toBeUndefined();
    expect(plan.options.launchContext.AGENT_LOCAL_RUNTIME_SOURCE_STAMP).toBeUndefined();
  });

  test('desktop launch owns a fresh local runtime instead of reusing discovered daemons', () => {
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
      path.join(os.tmpdir(), 'desktop-runtime', 'local-runtime-daemon.json'),
    );
  });

  test('local runtime daemon lines write to sidecar log layer and stderr stream', () => {
    const originalEnv = process.env;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-sidecar-log-'));
    const logFile = path.join(tempDir, 'sidecar.log');
    const stderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      process.env = {
        ...originalEnv,
        AGENT_SIDECAR_LOG_FILE: logFile,
      };
      const plan = createDesktopLocalRuntimeLaunchPlan({
        backendEndpoints: { httpUrl: 'https://api.windieos.com' },
      });

      expect(plan.ok).toBe(true);
      plan.options.onStdoutLine('daemon ready');
      plan.options.onStdoutLine('[LocalRuntime] ready');
      const retiredLogPrefix = `[Local${'Backend'}]`;
      plan.options.onStderrLine(`${retiredLogPrefix} legacy ready`);
      plan.options.onStderrLine('[UnknownRuntime] noisy daemon detail');
      plan.options.onStderrLine('[LocalRuntimeDaemon] listening pid=123');

      expect(stderrWrite).toHaveBeenCalledWith('[LocalRuntimeDaemon] daemon ready\n');
      expect(stderrWrite).toHaveBeenCalledWith('[LocalRuntime] ready\n');
      expect(stderrWrite).not.toHaveBeenCalledWith(`${retiredLogPrefix} legacy ready\n`);
      expect(stderrWrite).not.toHaveBeenCalledWith('[UnknownRuntime] noisy daemon detail\n');
      expect(stderrWrite).toHaveBeenCalledWith('[LocalRuntimeDaemon] listening pid=123\n');
      const log = fs.readFileSync(logFile, 'utf8');
      expect(log).toContain('[LocalRuntimeDaemon] daemon ready');
      expect(log).toContain('[LocalRuntime] ready');
      expect(log).not.toContain(`${retiredLogPrefix} legacy ready`);
      expect(log).not.toContain('[UnknownRuntime] noisy daemon detail');
      expect(log).toContain('[LocalRuntimeDaemon] listening pid=123');
    } finally {
      stderrWrite.mockRestore();
      process.env = originalEnv;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('local runtime daemon stderr filtering uses configured host env flag', () => {
    const originalEnv = process.env;
    const stderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      process.env = {
        ...originalEnv,
        WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR: '1',
      };
      const plan = createDesktopLocalRuntimeLaunchPlan({
        backendEndpoints: { httpUrl: 'https://api.windieos.com' },
        localRuntimeEnv: mainHostSkin.localRuntime.env,
      });

      expect(plan.ok).toBe(true);
      plan.options.onStderrLine('2026-06-17 10:00:00 - DEBUG - noisy daemon detail');

      expect(stderrWrite).toHaveBeenCalledWith(
        '[LocalRuntimeDaemon] 2026-06-17 10:00:00 - DEBUG - noisy daemon detail\n',
      );
    } finally {
      stderrWrite.mockRestore();
      process.env = originalEnv;
    }
  });

  test('process spawn events write generic local runtime launch logs', () => {
    const originalEnv = process.env;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-main-log-'));
    const logFile = path.join(tempDir, 'main.log');
    const retiredBridgeLog = `[Main][${'Sidecar' + 'Bridge'}] spawned sidecar daemon`;

    try {
      process.env = {
        ...originalEnv,
        AGENT_MAIN_LOG_FILE: logFile,
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
      expect(log).not.toContain(retiredBridgeLog);
    } finally {
      process.env = originalEnv;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
