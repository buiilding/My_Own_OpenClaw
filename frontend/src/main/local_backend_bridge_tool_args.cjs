const { getErrorMessage } = require('./local_backend_bridge_utils.cjs');

function resolveRunShellCommandArgs(args, getFrontendConfig, warn = console.warn) {
  const nextArgs = (
    args
    && typeof args === 'object'
    && !Array.isArray(args)
  ) ? { ...args } : {};

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

function resolveToolArgs(toolName, args, getFrontendConfig, warn = console.warn) {
  if (toolName === 'run_shell_command') {
    return resolveRunShellCommandArgs(args, getFrontendConfig, warn);
  }
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return { ...args };
  }
  return {};
}

module.exports = {
  resolveToolArgs,
};
