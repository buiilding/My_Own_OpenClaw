/**
 * Runtime path helpers for dev vs packaged Electron execution.
 *
 * Packaged builds can run from app.asar, where child processes cannot execute
 * scripts directly from the archive. Packaged local runtime code is expected
 * under resources/python-runtime/sidecar as sourceless bytecode.
 */

const fs = require('fs');
const path = require('path');
let electronApp = null;
try {
  ({ app: electronApp } = require('electron'));
} catch (_error) {
  electronApp = null;
}

function isPackagedApp() {
  return Boolean(electronApp && electronApp.isPackaged);
}

function getResourcesRoot() {
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.trim().length > 0) {
    return process.resourcesPath;
  }
  // Fallback for test/runtime edge cases where Electron hasn't populated
  // process.resourcesPath yet.
  return path.join(process.cwd(), 'resources');
}

function getBundledRuntimeRoots() {
  if (!isPackagedApp()) {
    return [];
  }
  const resourcesRoot = getResourcesRoot();
  return [
    path.join(resourcesRoot, 'python-runtime'),
    path.join(resourcesRoot, 'python'),
  ];
}

function firstExistingPath(paths) {
  for (const candidate of paths) {
    if (!candidate) {
      continue;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function normalizePythonEntrypointName(scriptName) {
  const rawScriptName = String(scriptName || '').trim();
  const scriptBaseName = path.basename(rawScriptName);
  if (scriptBaseName !== rawScriptName || !scriptBaseName.toLowerCase().endsWith('.py')) {
    throw new Error(`Local runtime launch target must be a Python entrypoint: ${scriptName}`);
  }
  return scriptBaseName;
}

function resolvePythonScriptPath(scriptName) {
  const scriptBaseName = normalizePythonEntrypointName(scriptName);

  if (isPackagedApp()) {
    const resourcesRoot = getResourcesRoot();
    return path.join(
      resourcesRoot,
      'python-runtime',
      'sidecar',
      `${scriptBaseName.slice(0, -3)}.pyc`,
    );
  }

  const candidates = [path.join(__dirname, '..', 'python', scriptBaseName)];
  return firstExistingPath(candidates) || candidates[0];
}

function getBundledPythonExecutableCandidates() {
  if (!isPackagedApp()) {
    return [];
  }

  const runtimeRoots = getBundledRuntimeRoots();

  if (process.platform === 'win32') {
    return runtimeRoots.flatMap((root) => [
      path.join(root, 'python.exe'),
      path.join(root, 'Scripts', 'python.exe'),
      path.join(root, 'bin', 'python.exe'),
    ]);
  }

  return runtimeRoots.flatMap((root) => [
    path.join(root, 'bin', 'python3'),
    path.join(root, 'bin', 'python'),
    path.join(root, 'python3'),
    path.join(root, 'python'),
  ]);
}

function resolvePythonExecutablePath() {
  const explicitPythonPath = process.env.WINDIE_PYTHON_PATH;
  if (explicitPythonPath && fs.existsSync(explicitPythonPath)) {
    return explicitPythonPath;
  }

  const bundledPython = firstExistingPath(getBundledPythonExecutableCandidates());
  if (bundledPython) {
    return bundledPython;
  }

  // Packaged apps should run with bundled sidecar runtime only.
  // Avoid silently depending on a user-installed interpreter.
  if (isPackagedApp()) {
    return null;
  }

  const condaPrefix = process.env.CONDA_PREFIX;
  if (condaPrefix) {
    const condaPython = process.platform === 'win32'
      ? path.join(condaPrefix, 'python.exe')
      : path.join(condaPrefix, 'bin', 'python3');
    if (fs.existsSync(condaPython)) {
      return condaPython;
    }
  }

  return process.platform === 'win32' ? 'py' : 'python3';
}

function resolveBundledRuntimeRootFromExecutable(executablePath) {
  if (!executablePath || !isPackagedApp()) {
    return null;
  }

  const absoluteExecutablePath = path.resolve(executablePath);
  if (process.platform === 'win32') {
    const executableDir = path.dirname(absoluteExecutablePath);
    if (path.basename(executableDir).toLowerCase() === 'scripts') {
      return path.dirname(executableDir);
    }
    return executableDir;
  }

  const executableDir = path.dirname(absoluteExecutablePath);
  if (path.basename(executableDir) === 'bin') {
    return path.dirname(executableDir);
  }
  return executableDir;
}

function resolveLocalRuntimeLaunchTarget(scriptName) {
  const normalizedScript = String(scriptName || '').trim();
  const scriptPath = resolvePythonScriptPath(normalizedScript);
  const pythonCommand = resolvePythonExecutablePath();
  return {
    kind: 'python',
    command: pythonCommand,
    args: [scriptPath],
    cwd: path.dirname(scriptPath),
    resolvedPath: scriptPath,
    runtimeRoot: resolveBundledRuntimeRootFromExecutable(pythonCommand),
  };
}

module.exports = {
  resolveLocalRuntimeLaunchTarget,
};
