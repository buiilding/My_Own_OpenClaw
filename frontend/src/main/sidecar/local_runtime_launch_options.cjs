/**
 * Provides local runtime launch options for the Electron main process.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveBackendEndpoints,
} = require('../app/backend_endpoints.cjs');
const {
  resolveLocalRuntimeLaunchTarget,
} = require('../app/runtime_paths.cjs');
const {
  shouldForwardStderrLine,
  withLocalRuntimeNodeOptions,
} = require('./local_runtime_utils.cjs');
const {
  appendLayerLogLine,
} = require('../logging/layer_log_sink.cjs');

const DEFAULT_DAEMON_DISCOVERY_PATH = path.join(
  os.tmpdir(),
  'desktop-runtime',
  'local-runtime-daemon.json',
);
const DEFAULT_DAEMON_START_TIMEOUT_MS = 10000;
const DEFAULT_DAEMON_POLL_INTERVAL_MS = 100;
const DAEMON_LAUNCH_CONTEXT_ENV_KEYS = [
  'WINDIE_BACKEND_HTTP_URL',
  'WINDIE_BACKEND_AUTH_STATE_PATH',
  'WINDIE_ENABLE_SEMANTIC_SUMMARIZER',
  'WINDIE_PACKAGED_APP',
  'WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL',
  'WINDIE_LOCAL_RUNTIME_SOURCE_PATH',
  'WINDIE_LOCAL_RUNTIME_SOURCE_STAMP',
];

const LOCAL_RUNTIME_SOURCE_STAMP_FILES = [
  'sidecar_daemon.py',
  'local_backend.py',
  'local_backend_memory_handlers.py',
];
const LOCAL_RUNTIME_LOG_PREFIXES = [
  '[LocalRuntimeDaemon]',
  '[LocalRuntime]',
  '[Tool]',
  '[MCP]',
];

function createMissingCommandError({ isPackaged, copy = {} } = {}) {
  if (isPackaged) {
    return copy.missingPythonRuntime
      || 'Bundled Python runtime not found in app resources. Please reinstall this app.';
  }
  return 'Python executable not found. Install Python 3 or set WINDIE_PYTHON_PATH to the frontend_jarvis Python executable.';
}

function resolveLocalRuntimeSourceStamp(launchTarget) {
  const resolvedPath = typeof launchTarget?.resolvedPath === 'string'
    ? launchTarget.resolvedPath
    : '';
  if (!resolvedPath) {
    return {
      sourcePath: '',
      sourceStamp: '',
    };
  }
  const sourceDir = path.dirname(resolvedPath);
  const stampParts = LOCAL_RUNTIME_SOURCE_STAMP_FILES.map((fileName) => {
    const filePath = path.join(sourceDir, fileName);
    try {
      const stat = fs.statSync(filePath);
      return `${fileName}:${Math.floor(stat.mtimeMs)}:${stat.size}`;
    } catch {
      return `${fileName}:missing`;
    }
  });
  return {
    sourcePath: resolvedPath,
    sourceStamp: stampParts.join('|'),
  };
}

function buildLocalRuntimeDaemonEnv({
  isPackaged = false,
  backendEndpoints,
  permissionStatePath,
  authStatePath,
  launchTarget,
} = {}) {
  const endpointConfig = backendEndpoints || resolveBackendEndpoints(process.env, {
    isPackaged,
  });
  const sourceIdentity = resolveLocalRuntimeSourceStamp(launchTarget);
  const backendEnv = withLocalRuntimeNodeOptions({
    ...process.env,
    PYTHONUNBUFFERED: '1',
    WINDIE_BACKEND_HTTP_URL: endpointConfig.httpUrl,
    WINDIE_PACKAGED_APP: isPackaged ? '1' : '0',
    WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: isPackaged ? '0' : '1',
    WINDIE_LOCAL_RUNTIME_SOURCE_PATH: sourceIdentity.sourcePath,
    WINDIE_LOCAL_RUNTIME_SOURCE_STAMP: sourceIdentity.sourceStamp,
    ...(typeof authStatePath === 'string' && authStatePath.trim()
      ? { WINDIE_BACKEND_AUTH_STATE_PATH: authStatePath.trim() }
      : {}),
    ...(typeof permissionStatePath === 'string' && permissionStatePath.trim()
      ? { WINDIE_PERMISSION_STATE_PATH: permissionStatePath.trim() }
      : {}),
    ...(
      isPackaged
      && launchTarget?.kind === 'python'
        ? {
            PYTHONDONTWRITEBYTECODE: '1',
            ...(
              process.platform !== 'win32'
              && launchTarget.runtimeRoot
                ? {
                    PYTHONHOME: launchTarget.runtimeRoot,
                    PYTHONNOUSERSITE: '1',
                  }
                : {}
            ),
          }
        : {}
    ),
  });
  if (isPackaged && launchTarget?.kind === 'python') {
    delete backendEnv.PYTHONPATH;
  }
  return backendEnv;
}

function buildLocalRuntimeLaunchContextFromEnv(env = {}) {
  const normalized = {};
  for (const key of DAEMON_LAUNCH_CONTEXT_ENV_KEYS) {
    normalized[key] = typeof env[key] === 'string' ? env[key].trim() : '';
  }
  return normalized;
}

function writeLocalRuntimeDaemonLogLine(line, {
  filter = true,
  stream = process.stderr,
  writeLayerLogLine = appendLayerLogLine,
} = {}) {
  const text = String(line || '').trim();
  const hasLocalRuntimePrefix = LOCAL_RUNTIME_LOG_PREFIXES.some((prefix) => text.startsWith(prefix));
  if (!text || (filter && !hasLocalRuntimePrefix && !shouldForwardStderrLine(text))) {
    return false;
  }
  const formatted = text.startsWith('[') ? text : `[LocalRuntimeDaemon] ${text}`;
  writeLayerLogLine('sidecar', formatted);
  stream?.write?.(`${formatted}\n`);
  return true;
}

function createDesktopLocalRuntimeLaunchPlan({
  backendEndpoints,
  discoveryFile = DEFAULT_DAEMON_DISCOVERY_PATH,
  isPackaged = false,
  permissionStatePath,
  authStatePath,
  WebSocketImpl,
  copy = {},
  resolveLaunchTarget = resolveLocalRuntimeLaunchTarget,
} = {}) {
  const launchTarget = resolveLaunchTarget('sidecar_daemon.py');
  if (launchTarget.kind === 'python' && !launchTarget.command) {
    return {
      ok: false,
      error: createMissingCommandError({ isPackaged, copy }),
      launchTarget,
    };
  }
  if (launchTarget.kind === 'python' && !fs.existsSync(launchTarget.resolvedPath)) {
    return {
      ok: false,
      error: `Local runtime daemon script not found: ${launchTarget.resolvedPath}`,
      launchTarget,
    };
  }
  const env = buildLocalRuntimeDaemonEnv({
    backendEndpoints,
    isPackaged,
    permissionStatePath,
    authStatePath,
    launchTarget,
  });
  return {
    ok: true,
    options: {
      command: launchTarget.command,
      args: launchTarget.args,
      cwd: launchTarget.cwd,
      discoveryFile,
      env,
      envMode: 'replace',
      launchContext: buildLocalRuntimeLaunchContextFromEnv(env),
      reuseExisting: false,
      startTimeoutMs: DEFAULT_DAEMON_START_TIMEOUT_MS,
      pollIntervalMs: DEFAULT_DAEMON_POLL_INTERVAL_MS,
      WebSocketImpl,
      onProcessSpawn: (details = {}) => {
        const command = typeof details.command === 'string' ? details.command : '';
        const cwd = typeof details.cwd === 'string' ? details.cwd : '';
        appendLayerLogLine(
          'main',
          `[Main][LocalRuntimeLaunch] spawned local runtime command=${JSON.stringify(command)} cwd=${JSON.stringify(cwd)}`,
        );
      },
      onStdoutLine: (line) => writeLocalRuntimeDaemonLogLine(line, { filter: false }),
      onStderrLine: (line) => writeLocalRuntimeDaemonLogLine(line),
    },
    launchTarget,
  };
}

module.exports = {
  createDesktopLocalRuntimeLaunchPlan,
};
