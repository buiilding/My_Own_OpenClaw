/**
 * Bridges local backend tool args behavior for the Electron main process.
 */

const { getErrorMessage } = require('./local_backend_bridge_utils.cjs');

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  const cloned = {};
  for (const [key, item] of Object.entries(value)) {
    cloned[key] = deepClone(item);
  }
  return cloned;
}

function normalizeDisplayBounds(displayBounds) {
  if (!isRecord(displayBounds)) {
    return null;
  }
  const x = Number(displayBounds.x);
  const y = Number(displayBounds.y);
  const width = Number(displayBounds.width);
  const height = Number(displayBounds.height);
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return null;
  }
  const normalized = {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
  if (typeof displayBounds.monitor_id === 'string' && displayBounds.monitor_id.trim().length > 0) {
    normalized.monitor_id = displayBounds.monitor_id.trim();
  }
  if (isRecord(displayBounds.desktop_virtual_bounds)) {
    const desktopVirtualBounds = normalizeDisplayBounds(displayBounds.desktop_virtual_bounds);
    if (desktopVirtualBounds) {
      delete desktopVirtualBounds.monitor_id;
      normalized.desktop_virtual_bounds = desktopVirtualBounds;
    }
  }
  return normalized;
}

function resolveScreenshotArgsWithDisplayBounds(args, defaultDisplayBounds) {
  const nextArgs = isRecord(args) ? deepClone(args) : {};
  const explicitDisplayBounds = normalizeDisplayBounds(nextArgs.display_bounds);
  if (!explicitDisplayBounds && defaultDisplayBounds) {
    nextArgs.display_bounds = defaultDisplayBounds;
  }
  return nextArgs;
}

function resolveRunShellCommandArgs(args, getFrontendConfig, warn = console.warn) {
  const nextArgs = (
    isRecord(args)
  ) ? deepClone(args) : {};

  let agentHasFullSudoAccess = false;
  if (typeof getFrontendConfig === 'function') {
    try {
      const config = getFrontendConfig();
      agentHasFullSudoAccess = Boolean(
        config
        && typeof config === 'object'
        && !Array.isArray(config)
        && config.agent_full_sudo_enabled === true,
      );
    } catch (error) {
      warn(
        `[LocalBackend] Failed to read frontend config for sudo auth mode: ${getErrorMessage(error)}`,
      );
    }
  }

  nextArgs.sudo_auth_mode = agentHasFullSudoAccess ? 'native' : 'os_prompt';
  return nextArgs;
}

function resolveToolArgs(
  toolName,
  args,
  getFrontendConfig,
  warn = console.warn,
  options = {},
) {
  if (toolName === 'run_shell_command') {
    return resolveRunShellCommandArgs(args, getFrontendConfig, warn);
  }
  const nextArgs = isRecord(args) ? deepClone(args) : {};
  if (toolName === 'screenshot') {
    const defaultDisplayBounds = normalizeDisplayBounds(options.displayBounds);
    return resolveScreenshotArgsWithDisplayBounds(nextArgs, defaultDisplayBounds);
  }
  return nextArgs;
}

module.exports = {
  resolveToolArgs,
};
