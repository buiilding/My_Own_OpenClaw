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

function sanitizeUsername(username) {
  if (typeof username !== 'string') {
    return null;
  }
  const trimmed = username.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[a-z_][a-z0-9_.-]*$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function buildEnableScript(username) {
  const sudoersRule = `${username} ALL=(ALL) NOPASSWD: ALL`;
  return [
    'set -euo pipefail',
    `cat > '${SUDOERS_RULE_PATH}' <<'EOF'`,
    sudoersRule,
    'EOF',
    `chmod 440 '${SUDOERS_RULE_PATH}'`,
    `visudo -cf '${SUDOERS_RULE_PATH}'`,
  ].join('\n');
}

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

async function runSudoNonInteractiveBash(script, deps = {}) {
  return runCommandWithCapturedOutput({
    command: 'sudo',
    args: ['-n', 'bash', '-lc', script],
    deps,
    startFailureReason: 'Failed to start sudo command.',
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
  const username = sanitizeUsername(deps.username);
  if (!username) {
    return {
      success: false,
      canceled: false,
      reason: 'Failed to resolve current username for sudoers update.',
    };
  }

  const actionLabel = enabled
    ? 'enable passwordless sudo access'
    : 'disable passwordless sudo access';
  const script = enabled ? buildEnableScript(username) : buildDisableScript();
  const execResult = enabled
    ? await runPkexecBash(script, deps)
    : await runSudoNonInteractiveBash(script, deps);

  if (execResult.success) {
    return {
      success: true,
      enabled,
      canceled: false,
      reason: enabled
        ? 'Passwordless sudo access has been enabled for the current user.'
        : 'Passwordless sudo access has been disabled for the current user.',
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
  if (!enabled) {
    const disableErrorText = String(execResult.stderr || '').toLowerCase();
    const passwordNeeded = disableErrorText.includes('password is required')
      || disableErrorText.includes('a password is required')
      || disableErrorText.includes('permission denied');
    if (passwordNeeded || authError.canceled) {
      return {
        success: false,
        enabled: !enabled,
        canceled: false,
        reason: 'Failed to disable passwordless sudo access without prompt. Run with existing sudo access or remove sudoers rule manually.',
      };
    }
  }

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
