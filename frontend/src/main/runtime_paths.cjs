/**
 * Runtime path helpers for dev vs packaged Electron execution.
 *
 * Packaged builds can run from app.asar, where child processes cannot execute
 * scripts directly from the archive. Packaged sidecar code is expected under
 * resources/python-runtime/sidecar as sourceless bytecode.
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
    if (scriptBaseName.toLowerCase().endsWith('.py')) {
      candidates.push(
        path.join(
          process.resourcesPath,
          'python-runtime',
          'sidecar',
          `${scriptBaseName.slice(0, -3)}.pyc`,
        ),
      );
    } else if (scriptBaseName.toLowerCase().endsWith('.pyc')) {
      candidates.push(
        path.join(process.resourcesPath, 'python-runtime', 'sidecar', scriptBaseName),
      );
    }
    return firstExistingPath(candidates) || candidates[0];
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

function resolveSidecarBinaryPath(serviceName) {
  const normalizedServiceName = String(serviceName || '').trim().replace(/\.py$/i, '');
  if (!normalizedServiceName || !isPackagedApp()) {
    return null;
  }

  const extension = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    path.join(process.resourcesPath, 'sidecar-bin', `${normalizedServiceName}${extension}`),
    path.join(process.resourcesPath, 'sidecar-bin', normalizedServiceName, `${normalizedServiceName}${extension}`),
  ];
  return firstExistingPath(candidates);
}

function resolveSidecarLaunchTarget(scriptName) {
  const normalizedScript = String(scriptName || '').trim();
  const serviceName = normalizedScript.replace(/\.py$/i, '');
  const binaryPath = resolveSidecarBinaryPath(serviceName);
  if (binaryPath) {
    return {
      kind: 'binary',
      command: binaryPath,
      args: [],
      cwd: path.dirname(binaryPath),
      resolvedPath: binaryPath,
    };
  }

  const scriptPath = resolvePythonScriptPath(normalizedScript);
  return {
    kind: 'python',
    command: resolvePythonExecutablePath(),
    args: [scriptPath],
    cwd: path.dirname(scriptPath),
    resolvedPath: scriptPath,
  };
}

module.exports = {
  resolvePythonExecutablePath,
  resolvePythonScriptPath,
  resolveSidecarBinaryPath,
  resolveSidecarLaunchTarget,
};
