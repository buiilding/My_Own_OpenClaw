/**
 * Runtime path helpers for dev vs packaged Electron execution.
 *
 * Packaged builds can run from app.asar, where child processes cannot execute
 * scripts directly from the archive. These helpers resolve unpacked paths first.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function isPackagedApp() {
  return Boolean(app && app.isPackaged);
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

function resolvePythonScriptPath(scriptName) {
  const scriptBaseName = String(scriptName || '').trim();
  const candidates = [];

  if (isPackagedApp()) {
    candidates.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'main', 'python', scriptBaseName),
    );
    candidates.push(path.join(process.resourcesPath, 'python', scriptBaseName));
  }

  candidates.push(path.join(__dirname, 'python', scriptBaseName));

  return firstExistingPath(candidates) || candidates[0];
}

function getBundledPythonExecutableCandidates() {
  if (!isPackagedApp()) {
    return [];
  }

  const runtimeRoots = [
    path.join(process.resourcesPath, 'python-runtime'),
    path.join(process.resourcesPath, 'python'),
  ];

  if (process.platform === 'win32') {
    return runtimeRoots.flatMap((root) => [
      path.join(root, 'python.exe'),
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

module.exports = {
  resolvePythonExecutablePath,
  resolvePythonScriptPath,
};
