/**
 * Public command execution helpers for docs and commit-history utilities.
 */

const { spawnSync } = require('child_process');

function capture(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    error: result.error ? result.error.message : null,
  };
}

module.exports = {
  capture,
};
