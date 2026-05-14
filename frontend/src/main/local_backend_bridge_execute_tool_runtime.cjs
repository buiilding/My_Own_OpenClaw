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
  executeMainProcessExtensionTool,
  getMainProcessExtensionToolHandler,
  hasExtensionLifecycleHooks,
  runExtensionLifecycleHook,
} = require('./extension_manifest.cjs');

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
  executeExtensionTool = executeMainProcessExtensionTool,
  getExtensionToolHandler = getMainProcessExtensionToolHandler,
  hasExtensionHooks = hasExtensionLifecycleHooks,
  runExtensionHook = runExtensionLifecycleHook,
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

  async function runBeforeToolCallHooks(toolName, normalizedArgs) {
    if (runExtensionHook === runExtensionLifecycleHook && !hasExtensionHooks('beforeToolCall')) {
      return { canceled: false, args: normalizedArgs };
    }
    let nextArgs = normalizedArgs;
    const hookResults = await runExtensionHook('beforeToolCall', {
      toolName,
      args: nextArgs,
    });
    for (const hookResult of hookResults) {
      if (hookResult?.error) {
        console.warn(`[ExtensionRuntime] beforeToolCall hook from ${hookResult.extension_id} failed: ${hookResult.error}`);
        continue;
      }
      const result = hookResult?.result;
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        continue;
      }
      if (result.cancel === true || result.allowed === false) {
        return {
          canceled: true,
          error: result.error || result.reason || `Tool call canceled by extension ${hookResult.extension_id}`,
        };
      }
      if (result.args && typeof result.args === 'object' && !Array.isArray(result.args)) {
        nextArgs = result.args;
      }
    }
    return { canceled: false, args: nextArgs };
  }

  async function runAfterToolCallHooks(toolName, normalizedArgs, result) {
    if (runExtensionHook === runExtensionLifecycleHook && !hasExtensionHooks('afterToolCall')) {
      return result;
    }
    let nextResult = result;
    const hookResults = await runExtensionHook('afterToolCall', {
      toolName,
      args: normalizedArgs,
      result: nextResult,
    });
    for (const hookResult of hookResults) {
      if (hookResult?.error) {
        console.warn(`[ExtensionRuntime] afterToolCall hook from ${hookResult.extension_id} failed: ${hookResult.error}`);
        continue;
      }
      const hookValue = hookResult?.result;
      if (
        hookValue
        && typeof hookValue === 'object'
        && !Array.isArray(hookValue)
        && hookValue.result
        && typeof hookValue.result === 'object'
      ) {
        nextResult = hookValue.result;
      }
    }
    return nextResult;
  }

  async function executeTool(event, { toolName, args } = {}) {
    try {
      let normalizedArgs = resolveNormalizedToolArgs(toolName, args, event);
      if (runExtensionHook !== runExtensionLifecycleHook || hasExtensionHooks('beforeToolCall')) {
        const beforeHookResult = await runBeforeToolCallHooks(toolName, normalizedArgs);
        if (beforeHookResult.canceled) {
          return {
            success: false,
            error: beforeHookResult.error,
          };
        }
        normalizedArgs = beforeHookResult.args;
      }
      const timeoutMs = resolveExecuteToolTimeoutMs(toolName);
      let result = null;
      if (executeExtensionTool !== executeMainProcessExtensionTool || getExtensionToolHandler(toolName)) {
        result = await executeExtensionTool(toolName, normalizedArgs, {
          senderWindowId: event?.sender?.id || null,
        });
      }
      if (!result) {
        const runTool = () => runExecuteToolRequest(toolName, normalizedArgs, timeoutMs);
        result = toolName === 'screenshot'
          ? await withHiddenWindowForScreenshot({
            platform,
            task: runTool,
            resolveWindows,
            resolveChatWindow,
            resolveResponseWindow,
          })
          : await runTool();
      }

      result = await materializeScreenshotAttachment(result, backendHttpUrl, {
        warn: console.warn,
        getErrorMessage,
        getArtifactUploadHeaders,
      });
      result = await runAfterToolCallHooks(toolName, normalizedArgs, result);

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
