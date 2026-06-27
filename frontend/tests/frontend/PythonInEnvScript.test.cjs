/**
 * Covers python in env script. behavior in the frontend test suite.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const pythonInEnvPath = path.join(repoRoot, 'scripts/python-in-env.sh');

function makeFakeConda(tempDir) {
  const fakePython = path.join(tempDir, 'frontend_jarvis', 'bin', 'python3');
  const condaPath = path.join(tempDir, 'conda');
  fs.writeFileSync(
    condaPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'args="$*"',
      `fake_python=${JSON.stringify(fakePython)}`,
      'if [[ "$args" == "run -n frontend_jarvis python -c import sys" ]]; then',
      '  exit 0',
      'fi',
      'if [[ "$args" == "run -n frontend_jarvis python -c import sys; print(sys.executable)" ]]; then',
      '  echo "$fake_python"',
      '  exit 0',
      'fi',
      'if [[ "${1:-}" == "run" && "${2:-}" == "--no-capture-output" && "${3:-}" == "-n" && "${4:-}" == "frontend_jarvis" ]]; then',
      '  shift 4',
      '  exec "$@"',
      'fi',
      'echo "unexpected fake conda args: $args" >&2',
      'exit 2',
      '',
    ].join('\n'),
  );
  fs.chmodSync(condaPath, 0o755);
  return { condaPath, fakePython };
}

describe('scripts/python-in-env.sh', () => {
  test('exports frontend env python as WINDIE_PYTHON_PATH over stale parent value', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-python-in-env-'));
    const { fakePython } = makeFakeConda(tempDir);

    try {
      const result = spawnSync(
        'bash',
        [
          pythonInEnvPath,
          'frontend',
          process.execPath,
          '-e',
          'process.stdout.write(process.env.WINDIE_PYTHON_PATH || "")',
        ],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            PATH: `${tempDir}${path.delimiter}${process.env.PATH || ''}`,
            WINDIE_PYTHON_PATH: '/stale/base/python3',
          },
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toBe(fakePython);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('accepts local-runtime as the canonical Python runtime target', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-python-in-env-runtime-'));
    const { fakePython } = makeFakeConda(tempDir);

    try {
      const result = spawnSync(
        'bash',
        [
          pythonInEnvPath,
          'local-runtime',
          process.execPath,
          '-e',
          'process.stdout.write(process.env.WINDIE_PYTHON_PATH || "")',
        ],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            PATH: `${tempDir}${path.delimiter}${process.env.PATH || ''}`,
            WINDIE_PYTHON_PATH: '/stale/base/python3',
          },
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toBe(fakePython);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
