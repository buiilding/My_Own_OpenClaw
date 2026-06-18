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
  resolveRuntimePathEnvConfig,
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
const DEFAULT_LOCAL_RUNTIME_DAEMON_ENV = Object.freeze({
  backendHttpUrl: 'AGENT_BACKEND_HTTP_URL',
  backendAuthStatePath: 'AGENT_BACKEND_AUTH_STATE_PATH',
  semanticSummarizer: 'AGENT_ENABLE_SEMANTIC_SUMMARIZER',
  packagedApp: 'AGENT_PACKAGED_APP',
  browserFeaturePackAutoinstall: 'AGENT_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL',
  sourcePath: 'AGENT_LOCAL_RUNTIME_SOURCE_PATH',
  sourceStamp: 'AGENT_LOCAL_RUNTIME_SOURCE_STAMP',
  permissionStatePath: 'AGENT_PERMISSION_STATE_PATH',
  userDataDir: 'AGENT_USER_DATA_DIR',
  logLevel: 'AGENT_LOCAL_RUNTIME_LOG_LEVEL',
});

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

function normalizeEnvKey(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function resolveLocalRuntimeDaemonEnvConfig(localRuntimeEnv = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(DEFAULT_LOCAL_RUNTIME_DAEMON_ENV).map(([key, fallback]) => [
      key,
      normalizeEnvKey(localRuntimeEnv?.[key], fallback),
    ]),
  ));
}

function resolveDaemonLaunchContextEnvKeys(localRuntimeEnv = {}) {
  const envConfig = resolveLocalRuntimeDaemonEnvConfig(localRuntimeEnv);
  return [
    envConfig.backendHttpUrl,
    envConfig.backendAuthStatePath,
    envConfig.semanticSummarizer,
    envConfig.packagedApp,
    envConfig.browserFeaturePackAutoinstall,
    envConfig.sourcePath,
    envConfig.sourceStamp,
    envConfig.userDataDir,
  ];
}

function createMissingCommandError({ isPackaged, copy = {}, runtimePathEnv = {} } = {}) {
  if (isPackaged) {
    return copy.missingPythonRuntime
      || 'Bundled Python runtime not found in app resources. Please reinstall this app.';
  }
  const pythonPathEnvKey = resolveRuntimePathEnvConfig(runtimePathEnv).pythonPath;
  return `Python executable not found. Install Python 3 or set ${pythonPathEnvKey} to the local-runtime Python executable.`;
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
  localRuntimeEnv,
  permissionStatePath,
  authStatePath,
  userDataRoot,
  launchTarget,
} = {}) {
  const endpointConfig = backendEndpoints || resolveBackendEndpoints(process.env, {
    isPackaged,
  });
  const envConfig = resolveLocalRuntimeDaemonEnvConfig(localRuntimeEnv);
  const sourceIdentity = resolveLocalRuntimeSourceStamp(launchTarget);
  const inheritedSemanticSummarizer = typeof process.env[envConfig.semanticSummarizer] === 'string'
    ? process.env[envConfig.semanticSummarizer]
    : undefined;
  const inheritedLogLevel = typeof process.env[envConfig.logLevel] === 'string'
    ? process.env[envConfig.logLevel]
    : undefined;
  const backendEnv = withLocalRuntimeNodeOptions({
    ...process.env,
    PYTHONUNBUFFERED: '1',
    [envConfig.backendHttpUrl]: endpointConfig.httpUrl,
    ...(envConfig.backendHttpUrl !== DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.backendHttpUrl
      ? { [DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.backendHttpUrl]: endpointConfig.httpUrl }
      : {}),
    ...(typeof inheritedSemanticSummarizer === 'string'
      ? {
          [envConfig.semanticSummarizer]: inheritedSemanticSummarizer,
          ...(envConfig.semanticSummarizer !== DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.semanticSummarizer
            ? { [DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.semanticSummarizer]: inheritedSemanticSummarizer }
            : {}),
        }
      : {}),
    ...(typeof inheritedLogLevel === 'string'
      ? {
          [envConfig.logLevel]: inheritedLogLevel,
          ...(envConfig.logLevel !== DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.logLevel
            ? { [DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.logLevel]: inheritedLogLevel }
            : {}),
        }
      : {}),
    [envConfig.packagedApp]: isPackaged ? '1' : '0',
    ...(envConfig.packagedApp !== DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.packagedApp
      ? { [DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.packagedApp]: isPackaged ? '1' : '0' }
      : {}),
    [envConfig.browserFeaturePackAutoinstall]: isPackaged ? '0' : '1',
    ...(envConfig.browserFeaturePackAutoinstall !== DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.browserFeaturePackAutoinstall
      ? { [DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.browserFeaturePackAutoinstall]: isPackaged ? '0' : '1' }
      : {}),
    [envConfig.sourcePath]: sourceIdentity.sourcePath,
    [envConfig.sourceStamp]: sourceIdentity.sourceStamp,
    ...(typeof authStatePath === 'string' && authStatePath.trim()
      ? {
          [envConfig.backendAuthStatePath]: authStatePath.trim(),
          ...(envConfig.backendAuthStatePath !== DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.backendAuthStatePath
            ? { [DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.backendAuthStatePath]: authStatePath.trim() }
            : {}),
        }
      : {}),
    ...(typeof permissionStatePath === 'string' && permissionStatePath.trim()
      ? {
          [envConfig.permissionStatePath]: permissionStatePath.trim(),
          ...(envConfig.permissionStatePath !== DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.permissionStatePath
            ? { [DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.permissionStatePath]: permissionStatePath.trim() }
            : {}),
        }
      : {}),
    ...(typeof userDataRoot === 'string' && userDataRoot.trim()
      ? {
          [envConfig.userDataDir]: userDataRoot.trim(),
          ...(envConfig.userDataDir !== DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.userDataDir
            ? { [DEFAULT_LOCAL_RUNTIME_DAEMON_ENV.userDataDir]: userDataRoot.trim() }
            : {}),
        }
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

function buildLocalRuntimeLaunchContextFromEnv(env = {}, localRuntimeEnv = {}) {
  const normalized = {};
  for (const key of resolveDaemonLaunchContextEnvKeys(localRuntimeEnv)) {
    normalized[key] = typeof env[key] === 'string' ? env[key].trim() : '';
  }
  return normalized;
}

function writeLocalRuntimeDaemonLogLine(line, {
  filter = true,
  localRuntimeEnv = {},
  stream = process.stderr,
  writeLayerLogLine = appendLayerLogLine,
} = {}) {
  const text = String(line || '').trim();
  const hasLocalRuntimePrefix = LOCAL_RUNTIME_LOG_PREFIXES.some((prefix) => text.startsWith(prefix));
  if (
    !text
    || (filter && !hasLocalRuntimePrefix && !shouldForwardStderrLine(text, process.env, localRuntimeEnv))
  ) {
    return false;
  }
  const formatted = text.startsWith('[') ? text : `[LocalRuntimeDaemon] ${text}`;
  writeLayerLogLine('local-runtime', formatted);
  stream?.write?.(`${formatted}\n`);
  return true;
}

function createDesktopLocalRuntimeLaunchPlan({
  backendEndpoints,
  discoveryFile = DEFAULT_DAEMON_DISCOVERY_PATH,
  isPackaged = false,
  localRuntimeEnv,
  permissionStatePath,
  authStatePath,
  userDataRoot,
  runtimePathEnv,
  runtimePaths,
  WebSocketImpl,
  copy = {},
  resolveLaunchTarget = resolveLocalRuntimeLaunchTarget,
} = {}) {
  const launchTarget = resolveLaunchTarget('sidecar_daemon.py', {
    runtimePathEnv,
    runtimePaths,
  });
  if (launchTarget.kind === 'python' && !launchTarget.command) {
    return {
      ok: false,
      error: createMissingCommandError({
        isPackaged,
        copy,
        runtimePathEnv: runtimePaths?.env || runtimePathEnv,
      }),
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
    localRuntimeEnv,
    permissionStatePath,
    authStatePath,
    userDataRoot,
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
      launchContext: buildLocalRuntimeLaunchContextFromEnv(env, localRuntimeEnv),
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
      onStderrLine: (line) => writeLocalRuntimeDaemonLogLine(line, { localRuntimeEnv }),
    },
    launchTarget,
  };
}

module.exports = {
  createDesktopLocalRuntimeLaunchPlan,
  resolveLocalRuntimeDaemonEnvConfig,
};
