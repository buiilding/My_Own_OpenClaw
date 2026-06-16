/**
 * Provides the tool surface lifecycle module for the Electron main process.
 */

function normalizeToolName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function createElectronToolSurfaceLifecycle(surfaceRuntime) {
  return {
    async beforeExecute(call = {}) {
      const toolName = normalizeToolName(call.toolName);
      if (toolName === 'mouse_control' || toolName === 'scroll_control') {
        return surfaceRuntime?.beginPointerControlLease?.(call);
      }
      if (toolName === 'screenshot') {
        return surfaceRuntime?.beginScreenshotCaptureLease?.(call);
      }
      return undefined;
    },
  };
}

module.exports = {
  createElectronToolSurfaceLifecycle,
};
