/**
 * Coordinates local runtime tool execution for the Electron main process.
 */

const fs = require('fs');

const { BrowserWindow, screen } = require('electron');

const { resolveToolArgs } = require('./local_runtime_tool_args.cjs');
const {
  withHiddenWindowForScreenshot,
} = require('./local_backend_bridge_window_visibility.cjs');
const {
  resolveScreenshotToolDisplayBounds,
} = require('./local_runtime_display_bounds.cjs');
const {
  materializeScreenshotAttachment,
} = require('./local_runtime_screenshot_attachment.cjs');
const {
  getErrorMessage,
} = require('./local_runtime_utils.cjs');
const {
  DEFAULT_REQUEST_TIMEOUT_MS,
  resolveExecuteToolTimeoutMs,
} = require('./local_runtime_timeout_policy.cjs');
const {
  getActiveDisplayAffinity,
  resolveActiveSurfaceDisplayAffinityForWindows,
  toScreenshotDisplayBounds,
} = require('../surfaces/display_affinity_runtime.cjs');

const LOCAL_RUNTIME_BRIDGE_LOG_PREFIX = '[Main][LocalRuntimeBridge]';

function normalizeToolName(toolName) {
  return typeof toolName === 'string' ? toolName.trim().toLowerCase() : '';
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

function createLocalRuntimeExecuteToolRuntime({
  sendRequest,
  backendHttpUrl,
  getArtifactUploadHeaders,
  resolveWindows,
  resolveChatWindow,
  resolveMainWindow,
  resolveResponseWindow,
  platform = process.platform,
  sdkLocalToolExecutor = null,
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
      {
        displayBounds: resolveDisplayBounds(event),
      },
    );
  }

  async function runExecuteToolRequest(toolName, normalizedArgs, timeoutMs) {
    if (sdkLocalToolExecutor && typeof sdkLocalToolExecutor.executeTool === 'function') {
      return sdkLocalToolExecutor.executeTool({
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
      let result = await runExecuteToolRequest(toolName, normalizedArgs, timeoutMs);

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
      console.error(`${LOCAL_RUNTIME_BRIDGE_LOG_PREFIX} tool_execution_failed message=${JSON.stringify(getErrorMessage(error))}`);
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
            `${LOCAL_RUNTIME_BRIDGE_LOG_PREFIX} screen_capture_verification_cleanup_failed path=${JSON.stringify(screenshotPath)} message=${JSON.stringify(getErrorMessage(error))}`,
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
        const runSdkScreenshotTool = () => (
          sdkLocalToolExecutor && typeof sdkLocalToolExecutor.executeTool === 'function'
            ? sdkLocalToolExecutor.executeTool({
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
          task: runSdkScreenshotTool,
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
  createLocalRuntimeExecuteToolRuntime,
};
