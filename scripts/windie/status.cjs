/**
 * Runs the status workflow for the developer CLI and automation tooling.
 */

const fs = require('fs');
const path = require('path');
const { capture } = require('./run.cjs');
const { FRONTEND_DIR, REPO_ROOT, repoPath } = require('./paths.cjs');
const { mainHostSkin } = require('../../frontend/src/main/app/main_host_skin.cjs');
const {
  configureBackendEndpointRuntime,
  resolveBackendEndpoints,
} = require('../../frontend/src/main/app/backend_endpoints.cjs');

configureBackendEndpointRuntime(mainHostSkin.hostedBackend);

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

function hasPlatformShim(name) {
  return exists(`bin/${name}.cmd`) && exists(`bin/${name}.sh`);
}

function platformPythonInEnvPath() {
  return process.platform === 'win32'
    ? repoPath('scripts/python-in-env.cmd')
    : repoPath('scripts/python-in-env.sh');
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
    platformPythonInEnvPath(),
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
  const { httpUrl, wsUrl } = resolveBackendEndpoints(env);
  return { httpUrl, wsUrl };
}

function collectStatus({ all = false } = {}) {
  const node = checkCommand('node');
  const npm = checkCommand('npm');
  const backendPython = checkPython('backend');
  const localRuntimePython = checkPython('local-runtime');
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
      name: 'local-runtime python',
      ok: localRuntimePython.ok,
      detail: localRuntimePython.value || localRuntimePython.error,
    },
    {
      name: 'docs navigation',
      ok: exists('docs/docs.json') && hasPlatformShim('docs-list'),
      detail: exists('docs/docs.json') ? 'docs/docs.json present' : 'docs/docs.json missing',
    },
    {
      name: 'launch scripts',
      ok:
        exists('scripts/run-backend.sh') &&
        exists('scripts/run-frontend-dev.sh') &&
        exists('scripts/run-frontend-electron.sh'),
      detail: 'backend, frontend, desktop launch wrappers',
    },
    {
      name: 'test scripts',
      ok: exists('scripts/test-backend.sh') && exists('scripts/test-sidecar.sh') && !!frontendScripts.test,
      detail: 'backend, local-runtime, frontend test wrappers',
    },
  ];

  const detail = {
    repoRoot: REPO_ROOT,
    endpoint,
    commands: {
      node,
      npm,
      backendPython,
      localRuntimePython,
      sidecarPython: localRuntimePython,
    },
    files: {
      docsList: hasPlatformShim('docs-list'),
      runBackend: exists('scripts/run-backend.sh'),
      runFrontend: exists('scripts/run-frontend-dev.sh'),
      runDesktop: exists('scripts/run-frontend-electron.sh'),
      backendLogs: exists('scripts/dev/backend-logs.sh'),
      deployRemoteBackend: exists('scripts/deploy/update-remote-backend.sh'),
      mockBackend: exists('scripts/mock-backend.cjs'),
      createExtension: exists('scripts/create-windie-extension.cjs'),
      generateManifest: exists('scripts/generate-builtin-tool-manifest.py'),
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
