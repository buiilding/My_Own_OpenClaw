const { spawn } = require('child_process');

const SUDOERS_RULE_PATH = '/etc/sudoers.d/99-windieos-agent-nopasswd';
const AUTH_CANCEL_MARKERS = [
  'not authorized',
  'request dismissed',
  'authentication dialog was dismissed',
  'authentication failed',
  'authorization failed',
  'user canceled',
  'user cancelled',
];

function buildDisableScript() {
  return [
    'set -euo pipefail',
    `rm -f '${SUDOERS_RULE_PATH}'`,
  ].join('\n');
}

function summarizeAuthError(stderr, actionLabel) {
  const normalized = String(stderr || '').toLowerCase();
  if (AUTH_CANCEL_MARKERS.some((marker) => normalized.includes(marker))) {
    return {
      canceled: true,
      reason: `User canceled or denied OS authentication while trying to ${actionLabel}.`,
    };
  }
  return {
    canceled: false,
    reason: `Failed to ${actionLabel}. ${String(stderr || '').trim() || 'Unknown authentication error.'}`,
  };
}

async function runPkexecBash(script, deps = {}) {
  return runCommandWithCapturedOutput({
    command: 'pkexec',
    args: ['bash', '-lc', script],
    deps,
    missingBinaryReason: 'OS authentication prompt is unavailable (pkexec not found).',
    startFailureReason: 'Failed to start OS authentication prompt.',
  });
}

async function runCommandWithCapturedOutput({
  command,
  args,
  deps = {},
  missingBinaryReason = null,
  startFailureReason,
}) {
  const spawnImpl = deps.spawnImpl || spawn;
  return await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawnImpl(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (missingBinaryReason && error?.code === 'ENOENT') {
        resolve({
          success: false,
          canceled: false,
          reason: missingBinaryReason,
          stdout,
          stderr,
        });
        return;
      }
      resolve({
        success: false,
        canceled: false,
        reason: error?.message || startFailureReason,
        stdout,
        stderr,
      });
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr,
      });
    });
  });
}

async function handleSetAgentSudoAccess(options = {}, deps = {}) {
  const platform = deps.platform || process.platform;
  if (platform !== 'linux') {
    return {
      success: false,
      canceled: false,
      reason: 'Passwordless sudo toggle is currently supported only on Linux.',
    };
  }

  const enabled = options?.enabled === true;
  if (enabled) {
    return {
      success: false,
      enabled: false,
      canceled: false,
      reason: 'Persistent passwordless sudo access is no longer supported. Sudo commands use per-command OS authentication prompts instead.',
    };
  }

  const actionLabel = 'disable legacy passwordless sudo access';
  const script = buildDisableScript();
  const execResult = await runPkexecBash(script, deps);

  if (execResult.success) {
    return {
      success: true,
      enabled,
      canceled: false,
      reason: 'Legacy passwordless sudo access has been disabled for the current user.',
    };
  }

  if (execResult.canceled === true) {
    return {
      success: false,
      enabled: !enabled,
      canceled: true,
      reason: execResult.reason || `User canceled or denied OS authentication while trying to ${actionLabel}.`,
    };
  }

  if (execResult.reason) {
    return {
      success: false,
      enabled: !enabled,
      canceled: false,
      reason: execResult.reason,
    };
  }

  const authError = summarizeAuthError(execResult.stderr, actionLabel);
  return {
    success: false,
    enabled: !enabled,
    canceled: authError.canceled,
    reason: authError.reason,
  };
}

module.exports = {
  handleSetAgentSudoAccess,
};
