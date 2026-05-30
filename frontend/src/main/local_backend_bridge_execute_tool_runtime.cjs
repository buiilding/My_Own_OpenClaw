const fs = require('fs');

const { BrowserWindow, screen } = require('electron');

const { resolveToolArgs } = require('./local_backend_bridge_tool_args.cjs');
const {
  withHiddenWindowForScreenshot,
} = require('./local_backend_bridge_windows.cjs');
const {
  resolveScreenshotToolDisplayBounds,
} = require('./local_backend_bridge_display_bounds.cjs');
const {
  materializeScreenshotAttachment,
} = require('./local_backend_bridge_screenshot_attachment.cjs');
const {
  getErrorMessage,
} = require('./local_backend_bridge_utils.cjs');
const {
  DEFAULT_REQUEST_TIMEOUT_MS,
  resolveExecuteToolTimeoutMs,
} = require('./local_backend_bridge_timeout_policy.cjs');
const {
  getActiveDisplayAffinity,
  resolveActiveSurfaceDisplayAffinityForWindows,
  toScreenshotDisplayBounds,
} = require('./display_affinity_runtime.cjs');
const {
  executeMcpTool,
  hasDiscoveredMcpTool,
} = require('./mcp_runtime.cjs');

const COMPUTER_USE_SURFACE_TOOL_NAMES = new Set([
  'mouse_control',
  'keyboard_control',
  'scroll_control',
  'switch_window',
  'wait',
  'screenshot',
  'click',
  'type',
  'scroll',
]);

function normalizeToolName(toolName) {
  return typeof toolName === 'string' ? toolName.trim().toLowerCase() : '';
}

function isComputerUseSurfaceTool(toolName) {
  return COMPUTER_USE_SURFACE_TOOL_NAMES.has(normalizeToolName(toolName));
}

function isScreenshotTool(toolName) {
  return normalizeToolName(toolName) === 'screenshot';
}

function stripUntrustedScreenshotPath(result) {
  if (
    result
    && result.success !== false
    && result.data
    && typeof result.data === 'object'
    && !Array.isArray(result.data)
    && typeof result.data.screenshot_path === 'string'
  ) {
    delete result.data.screenshot_path;
  }
  return result;
}

function createLocalBackendExecuteToolRuntime({
  sendRequest,
  backendHttpUrl,
  getArtifactUploadHeaders,
  getFrontendConfig,
  resolveWindows,
  resolveChatWindow,
  resolveMainWindow,
  resolveResponseWindow,
  platform = process.platform,
  executeLocalMcpTool = executeMcpTool,
  hasLocalMcpTool = hasDiscoveredMcpTool,
  sidecarDaemonClient = null,
  prepareComputerUseSurface = null,
} = {}) {
  function resolveDisplayBounds(event) {
    return resolveScreenshotToolDisplayBounds({
      BrowserWindow,
      screen,
      webContents: event?.sender || null,
      resolveChatWindow,
      resolveMainWindow,
      getActiveDisplayAffinity,
      resolveActiveSurfaceDisplayAffinityForWindows,
      toScreenshotDisplayBounds,
    });
  }

  function resolveNormalizedToolArgs(toolName, args, event) {
    return resolveToolArgs(
      toolName,
      args,
      getFrontendConfig,
      console.warn,
      {
        displayBounds: resolveDisplayBounds(event),
      },
    );
  }

  async function runExecuteToolRequest(toolName, normalizedArgs, timeoutMs) {
    if (sidecarDaemonClient && typeof sidecarDaemonClient.executeTool === 'function') {
      return sidecarDaemonClient.executeTool({
        toolName,
        args: normalizedArgs,
        timeoutMs,
      });
    }
    return sendRequest(
      'execute_tool',
      {
        tool_name: toolName,
        args: normalizedArgs,
      },
      { timeoutMs },
    );
  }

  async function executeTool(event, { toolName, args } = {}) {
    try {
      const normalizedArgs = resolveNormalizedToolArgs(toolName, args, event);
      const timeoutMs = resolveExecuteToolTimeoutMs(toolName);
      let result = null;
      if (
        isComputerUseSurfaceTool(toolName)
        && typeof prepareComputerUseSurface === 'function'
      ) {
        await prepareComputerUseSurface({ toolName, args: normalizedArgs });
      }
      if (hasLocalMcpTool(toolName)) {
        result = await executeLocalMcpTool(toolName, normalizedArgs, {
          senderWindowId: event?.sender?.id || null,
        });
      }
      if (!result) {
        const runTool = () => runExecuteToolRequest(toolName, normalizedArgs, timeoutMs);
        result = isScreenshotTool(toolName)
          ? await withHiddenWindowForScreenshot({
            platform,
            task: runTool,
            resolveWindows,
            resolveChatWindow,
            resolveResponseWindow,
          })
          : await runTool();
      }

      if (isScreenshotTool(toolName)) {
        result = await materializeScreenshotAttachment(result, backendHttpUrl, {
          warn: console.warn,
          getErrorMessage,
          getArtifactUploadHeaders,
        });
      } else {
        result = stripUntrustedScreenshotPath(result);
      }

      if (result.success === false) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        data: result.data || result,
      };
    } catch (error) {
      console.error(`[LocalBackend] Tool execution failed: ${getErrorMessage(error)}`);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  function createScreenCaptureCapabilityVerifier() {
    return async () => {
      const cleanupScreenshotPath = async (result) => {
        const screenshotPath = result?.data?.screenshot_path;
        if (typeof screenshotPath !== 'string' || !screenshotPath.trim()) {
          return;
        }
        try {
          await fs.promises.unlink(screenshotPath);
        } catch (error) {
          console.warn(
            `[LocalBackend] Failed to delete screen-capture verification screenshot ${screenshotPath}: ${getErrorMessage(error)}`,
          );
        }
      };

      try {
        const runTool = () => sendRequest(
          'execute_tool',
          {
            tool_name: 'screenshot',
            args: {
              explanation: 'Screen capture permission verification',
              expectation: 'Permission verification screenshot',
            },
          },
          { timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS },
        );
        const runDaemonTool = () => (
          sidecarDaemonClient && typeof sidecarDaemonClient.executeTool === 'function'
            ? sidecarDaemonClient.executeTool({
                toolName: 'screenshot',
                args: {
                  explanation: 'Screen capture permission verification',
                  expectation: 'Permission verification screenshot',
                },
                timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
              })
            : runTool()
        );
        const result = await withHiddenWindowForScreenshot({
          platform,
          task: runDaemonTool,
          resolveWindows,
          resolveChatWindow,
          resolveResponseWindow,
        });

        await cleanupScreenshotPath(result);

        if (result?.success === true) {
          return {
            granted: true,
            reason: 'Real screenshot capture succeeded.',
            details: {
              capture_engine: result?.data?.capture_meta?.capture_engine || null,
              capture_meta: result?.data?.capture_meta || null,
            },
          };
        }

        return {
          granted: false,
          reason: result?.error || 'Real screenshot capture failed.',
          details: {
            result: result || null,
          },
        };
      } catch (error) {
        return {
          granted: false,
          reason: getErrorMessage(error),
          details: {
            error: getErrorMessage(error),
          },
        };
      }
    };
  }

  return {
    createScreenCaptureCapabilityVerifier,
    executeTool,
  };
}

module.exports = {
  createLocalBackendExecuteToolRuntime,
};
