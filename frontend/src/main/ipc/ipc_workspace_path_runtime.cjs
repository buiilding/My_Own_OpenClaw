/**
 * Resolves workspace path inputs for Electron main Agent SDK runtime calls.
 */

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveWorkspacePathForAgentPayload(payload = {}, desktopUiConfig = null) {
  return (
    normalizeOptionalString(payload?.workspace_path)
    || normalizeOptionalString(payload?.workspacePath)
    || normalizeOptionalString(desktopUiConfig?.workspace_path)
    || normalizeOptionalString(desktopUiConfig?.workspacePath)
  );
}

function createWorkspacePathRuntime({
  getLatestDesktopUiConfig = () => null,
} = {}) {
  function resolve(payload = {}) {
    return resolveWorkspacePathForAgentPayload(
      payload,
      getLatestDesktopUiConfig(),
    );
  }

  return {
    resolve,
  };
}

module.exports = {
  createWorkspacePathRuntime,
};
