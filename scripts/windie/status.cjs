/**
 * Runs the status workflow for the developer CLI and automation tooling.
 */

const fs = require('fs');
const path = require('path');
const { capture } = require('./run.cjs');
const { FRONTEND_DIR, REPO_ROOT, repoPath } = require('./paths.cjs');

function exists(relativePath) {
  return fs.existsSync(repoPath(relativePath));
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(repoPath(relativePath), 'utf8'));
  } catch {
    return null;
  }
}

function checkCommand(name, args = ['--version']) {
  const result = capture(name, args, { cwd: REPO_ROOT });
  return {
    ok: result.ok,
    value: result.ok ? result.stdout.split(/\r?\n/)[0] : null,
    error: result.ok ? null : result.error || result.stderr || `exit ${result.status}`,
  };
}

function checkPython(target) {
  const result = capture(
    repoPath('scripts/python-in-env'),
    [target, 'python', '-c', 'import sys; print(sys.version.split()[0])'],
    { cwd: REPO_ROOT },
  );
  return {
    ok: result.ok,
    value: result.ok ? result.stdout.split(/\r?\n/).pop() : null,
    error: result.ok ? null : result.error || result.stderr || `exit ${result.status}`,
  };
}

function getFrontendScripts() {
  const packageJson = readJson('frontend/package.json');
  return packageJson?.scripts || {};
}

function getEndpointSnapshot(env = process.env) {
  const host = env.BACKEND_HOST || '127.0.0.1';
  const port = env.BACKEND_PORT || '8765';
  const httpUrl =
    env.BACKEND_HTTP_URL ||
    (env.BACKEND_HOST || env.BACKEND_PORT ? `http://${host}:${port}` : null) ||
    env.WINDIE_DEFAULT_BACKEND_HTTP_URL ||
    env.WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL ||
    'https://api.windieos.com';
  const wsUrl =
    env.BACKEND_WS_URL ||
    (env.BACKEND_HOST || env.BACKEND_PORT ? `ws://${host}:${port}/ws` : null) ||
    env.WINDIE_DEFAULT_BACKEND_WS_URL ||
    env.WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL ||
    'wss://api.windieos.com/ws';
  return { httpUrl, wsUrl };
}

function collectStatus({ all = false } = {}) {
  const node = checkCommand('node');
  const npm = checkCommand('npm');
  const backendPython = checkPython('backend');
  const sidecarPython = checkPython('sidecar');
  const frontendScripts = getFrontendScripts();
  const endpoint = getEndpointSnapshot();

  const checks = [
    {
      name: 'repo root',
      ok: exists('AGENTS.md') && exists('backend') && exists('frontend'),
      detail: REPO_ROOT,
    },
    { name: 'node', ok: node.ok, detail: node.value || node.error },
    { name: 'npm', ok: npm.ok, detail: npm.value || npm.error },
    {
      name: 'frontend dependencies',
      ok: fs.existsSync(path.join(FRONTEND_DIR, 'node_modules')),
      detail: fs.existsSync(path.join(FRONTEND_DIR, 'node_modules'))
        ? 'frontend/node_modules present'
        : 'run npm install in frontend',
    },
    {
      name: 'backend python',
      ok: backendPython.ok,
      detail: backendPython.value || backendPython.error,
    },
    {
      name: 'sidecar python',
      ok: sidecarPython.ok,
      detail: sidecarPython.value || sidecarPython.error,
    },
    {
      name: 'docs navigation',
      ok: exists('docs/docs.json') && exists('bin/docs-list'),
      detail: exists('docs/docs.json') ? 'docs/docs.json present' : 'docs/docs.json missing',
    },
    {
      name: 'launch scripts',
      ok:
        exists('scripts/run-backend') &&
        exists('scripts/run-frontend-dev') &&
        exists('scripts/run-frontend-electron'),
      detail: 'backend, frontend, desktop launch wrappers',
    },
    {
      name: 'test scripts',
      ok: exists('scripts/test-backend') && exists('scripts/test-sidecar') && !!frontendScripts.test,
      detail: 'backend, sidecar, frontend test wrappers',
    },
  ];

  const detail = {
    repoRoot: REPO_ROOT,
    endpoint,
    commands: {
      node,
      npm,
      backendPython,
      sidecarPython,
    },
    files: {
      docsList: exists('bin/docs-list'),
      runBackend: exists('scripts/run-backend'),
      runFrontend: exists('scripts/run-frontend-dev'),
      runDesktop: exists('scripts/run-frontend-electron'),
      backendLogs: exists('scripts/dev/backend-logs'),
      deployRemoteBackend: exists('scripts/deploy/update-remote-backend'),
      mockBackend: exists('scripts/mock-backend.cjs'),
      createExtension: exists('scripts/create-windie-extension.cjs'),
      generateManifest: exists('scripts/generate-builtin-tool-manifest'),
    },
    frontendScripts: all ? frontendScripts : undefined,
  };

  const ok = checks.every((check) => check.ok);
  return {
    ok,
    checks,
    detail,
  };
}

module.exports = {
  collectStatus,
  getEndpointSnapshot,
};
