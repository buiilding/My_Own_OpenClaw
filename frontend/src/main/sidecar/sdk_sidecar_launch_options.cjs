const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveBackendEndpoints,
} = require('../app/backend_endpoints.cjs');
const {
  resolveSidecarLaunchTarget,
} = require('../app/runtime_paths.cjs');
const {
  createMissingCommandError,
} = require('./local_backend_launch_plan.cjs');
const {
  shouldForwardStderrLine,
  withLocalBackendNodeOptions,
} = require('./local_backend_bridge_utils.cjs');

const DEFAULT_DAEMON_DISCOVERY_PATH = path.join(
  os.tmpdir(),
  'windieos',
  'sidecar-daemon.json',
);
const DEFAULT_DAEMON_START_TIMEOUT_MS = 10000;
const DEFAULT_DAEMON_POLL_INTERVAL_MS = 100;
const DAEMON_LAUNCH_CONTEXT_ENV_KEYS = [
  'WINDIE_BACKEND_HTTP_URL',
  'WINDIE_BACKEND_AUTH_STATE_PATH',
  'WINDIE_ENABLE_SEMANTIC_SUMMARIZER',
  'WINDIE_PACKAGED_APP',
  'WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL',
];

function buildSidecarDaemonEnv({
  isPackaged = false,
  backendEndpoints,
  permissionStatePath,
  authStatePath,
  launchTarget,
} = {}) {
  const endpointConfig = backendEndpoints || resolveBackendEndpoints(process.env, {
    isPackaged,
  });
  const backendEnv = withLocalBackendNodeOptions({
    ...process.env,
    PYTHONUNBUFFERED: '1',
    WINDIE_BACKEND_HTTP_URL: endpointConfig.httpUrl,
    WINDIE_PACKAGED_APP: isPackaged ? '1' : '0',
    WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL: isPackaged ? '0' : '1',
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

function buildSidecarLaunchContextFromEnv(env = {}) {
  const normalized = {};
  for (const key of DAEMON_LAUNCH_CONTEXT_ENV_KEYS) {
    normalized[key] = typeof env[key] === 'string' ? env[key].trim() : '';
  }
  return normalized;
}

function createDesktopAutoSidecarLaunchPlan({
  backendEndpoints,
  discoveryFile = DEFAULT_DAEMON_DISCOVERY_PATH,
  isPackaged = false,
  permissionStatePath,
  authStatePath,
  WebSocketImpl,
} = {}) {
  const launchTarget = resolveSidecarLaunchTarget('sidecar_daemon.py');
  if (launchTarget.kind === 'python' && !launchTarget.command) {
    return {
      ok: false,
      error: createMissingCommandError({ isPackaged }),
      launchTarget,
    };
  }
  if (launchTarget.kind === 'python' && !fs.existsSync(launchTarget.resolvedPath)) {
    return {
      ok: false,
      error: `Sidecar daemon script not found: ${launchTarget.resolvedPath}`,
      launchTarget,
    };
  }
  const env = buildSidecarDaemonEnv({
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
      launchContext: buildSidecarLaunchContextFromEnv(env),
      reuseExisting: true,
      startTimeoutMs: DEFAULT_DAEMON_START_TIMEOUT_MS,
      pollIntervalMs: DEFAULT_DAEMON_POLL_INTERVAL_MS,
      WebSocketImpl,
      onStderrLine: (line) => {
        const text = String(line || '').trim();
        if (text && shouldForwardStderrLine(text)) {
          console.log(`[SidecarDaemon] ${text}`);
        }
      },
    },
    launchTarget,
  };
}

module.exports = {
  DAEMON_LAUNCH_CONTEXT_ENV_KEYS,
  DEFAULT_DAEMON_DISCOVERY_PATH,
  buildSidecarDaemonEnv,
  buildSidecarLaunchContextFromEnv,
  createDesktopAutoSidecarLaunchPlan,
};
