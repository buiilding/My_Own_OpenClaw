/**
 * Bridges local runtime timeout policy behavior for the Electron main process.
 */

const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
const DEFAULT_EXECUTE_TOOL_TIMEOUT_MS = 60000;
const BROWSER_EXECUTE_TOOL_TIMEOUT_MS = 120000;

function resolveExecuteToolTimeoutMs(toolName) {
  return toolName === 'browser'
    ? BROWSER_EXECUTE_TOOL_TIMEOUT_MS
    : DEFAULT_EXECUTE_TOOL_TIMEOUT_MS;
}

module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MS,
  resolveExecuteToolTimeoutMs,
};
