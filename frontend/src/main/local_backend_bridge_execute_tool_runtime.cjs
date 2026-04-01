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

function createLocalBackendExecuteToolRuntime({
  sendRequest,
  backendHttpUrl,
  getFrontendConfig,
  resolveWindows,
  resolveChatWindow,
  resolveMainWindow,
  resolveResponseWindow,
  platform = process.platform,
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
      const runTool = () => runExecuteToolRequest(toolName, normalizedArgs, timeoutMs);
      let result = toolName === 'screenshot'
        ? await withHiddenWindowForScreenshot({
          platform,
          task: runTool,
          resolveWindows,
          resolveChatWindow,
          resolveResponseWindow,
        })
        : await runTool();

      result = await materializeScreenshotAttachment(result, backendHttpUrl, {
        warn: console.warn,
        getErrorMessage,
      });

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
        const result = await withHiddenWindowForScreenshot({
          platform,
          task: runTool,
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
              capture_backend: result?.data?.capture_meta?.capture_backend || null,
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
