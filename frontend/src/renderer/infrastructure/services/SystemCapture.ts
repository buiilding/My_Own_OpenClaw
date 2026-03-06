/**
 * System state and screenshot capture helpers.
 * Pure infrastructure utilities with no React dependencies.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import type { SystemState, ToolResult } from './MessageFormatter';
import {
  prepareExternalFocusForCapture,
  prepareScreenshotCaptureVisibility,
  restoreScreenshotCaptureVisibility,
  type CaptureVisibilityPreparation,
} from './SurfaceOrchestrator';
import {
  buildExtractOsStateResult,
  buildScreenshotArgs,
  createEmptyExtractOsStateResult,
  extractScreenshotData,
} from './systemCaptureRuntime';

/**
 * Extract OS state (system state and/or screenshot) with configurable options.
 * Unified function for all screenshot and system state capture scenarios.
 *
 * @param enable_screenshot - Whether to capture screenshot
 * @param enable_system_state - Whether to get system state
 * @param wait - Wait time in seconds before capturing (converted to milliseconds internally)
 * @param is_first_user_message - Whether this is the first user message (extracts full system state with 0 wait)
 * @returns Object with systemState and screenshot, or nulls if capture failed or disabled
 */
export async function extractOSstate(
  enable_screenshot: boolean,
  enable_system_state: boolean,
  wait: number,
  is_first_user_message: boolean = false,
  captureCorrelationId: string | null = null,
): Promise<ReturnType<typeof createEmptyExtractOsStateResult>> {
  const shouldEmitCaptureEvent = enable_screenshot && typeof window !== 'undefined';
  let screenshotVisibilityPreparation: CaptureVisibilityPreparation = {
    prepared: false,
    captureId: 'capture-uninitialized',
  };
  if (shouldEmitCaptureEvent) {
    window.dispatchEvent(new CustomEvent('windie:screenshot-capture', {
      detail: { active: true },
    }));
  }

  try {
    // Convert wait from seconds to milliseconds
    const waitMilliseconds = wait * 1000;

    // Wait for specified delay (allows UI to update before capturing)
    if (waitMilliseconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
    }

    if (enable_screenshot) {
      screenshotVisibilityPreparation = await prepareScreenshotCaptureVisibility({
        captureId: captureCorrelationId,
        source: 'system-capture',
      });
    }
    const captureFocusCorrelationId = screenshotVisibilityPreparation.prepared
      ? screenshotVisibilityPreparation.captureId
      : captureCorrelationId;
    if (enable_screenshot || enable_system_state) {
      await prepareExternalFocusForCapture({
        captureId: captureFocusCorrelationId,
        source: 'system-capture',
      });
    }

    // For first user message, extract full system state with 0 wait
    if (is_first_user_message) {
      try {
        const [stateResult, screenshotResult] = await Promise.all([
          enable_system_state
            ? IpcBridge.invoke<SystemState>(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
                fields: ['active_window', 'mouse_position', 'screen_resolution', 'windows'],
              })
            : Promise.resolve(null),
          enable_screenshot
            ? IpcBridge.invoke<ToolResult>(INVOKE_CHANNELS.EXECUTE_TOOL, {
                toolName: 'screenshot',
                args: buildScreenshotArgs('Initial user message screenshot'),
                skipAutoCapture: false,
              })
            : Promise.resolve({ success: false, data: null }),
        ]);

        const systemState = enable_system_state ? stateResult : null;
        const screenshotData = enable_screenshot
          ? extractScreenshotData(screenshotResult)
          : createEmptyExtractOsStateResult();

        return buildExtractOsStateResult({
          systemState,
          screenshotData,
        });
      } catch (err) {
        console.error(
          '[extractOSstate] Failed to extract OS state (first user message):',
          err,
        );
        return createEmptyExtractOsStateResult();
      }
    }

    // Regular extraction for tool outputs.
    try {
      const promises: Array<Promise<any>> = [];

      if (enable_system_state) {
        promises.push(
          IpcBridge.invoke<SystemState>(INVOKE_CHANNELS.GET_SYSTEM_STATE, {
            fields: ['active_window', 'mouse_position', 'screen_resolution'],
          }),
        );
      }

      if (enable_screenshot) {
        promises.push(
          IpcBridge.invoke<ToolResult>(INVOKE_CHANNELS.EXECUTE_TOOL, {
            toolName: 'screenshot',
            args: buildScreenshotArgs('Screenshot capture'),
            skipAutoCapture: false,
          }),
        );
      }

      // Execute enabled operations in parallel
      const results = await Promise.all(promises);

      let systemState: SystemState | null = null;
      let screenshotData = createEmptyExtractOsStateResult();

      let resultIndex = 0;
      if (enable_system_state) {
        systemState = results[resultIndex];
        resultIndex += 1;
      }

      if (enable_screenshot) {
        const screenshotResult = results[resultIndex];
        screenshotData = extractScreenshotData(screenshotResult);
      }

      return buildExtractOsStateResult({
        systemState,
        screenshotData,
      });
    } catch (err) {
      console.error('[extractOSstate] Failed to extract OS state:', err);
      return createEmptyExtractOsStateResult();
    }
  } finally {
    await restoreScreenshotCaptureVisibility(screenshotVisibilityPreparation, {
      source: 'system-capture',
    });
    if (shouldEmitCaptureEvent) {
      window.dispatchEvent(new CustomEvent('windie:screenshot-capture', {
        detail: { active: false },
      }));
    }
  }
}
