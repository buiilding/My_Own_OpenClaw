/**
 * System state and screenshot capture helpers.
 * Pure infrastructure utilities with no React dependencies.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import { getStoredDisplayBounds } from '../../utils/displaySelection';
import type { SystemState, ToolResult } from './MessageFormatter';
import {
  prepareExternalFocusForCapture,
  prepareScreenshotCaptureVisibility,
  restoreScreenshotCaptureVisibility,
  type CaptureVisibilityPreparation,
} from './SurfaceOrchestrator';
import {
  resolveScreenshotContentType,
  sanitizeCaptureMeta,
} from './CapturePayloadUtils';

function buildScreenshotArgs(explanation: string) {
  const args: Record<string, any> = {
    explanation,
    expectation: 'Current screen state',
  };
  const displayBounds = getStoredDisplayBounds();
  if (displayBounds) {
    args.display_bounds = displayBounds;
  }
  return args;
}

export type CaptureMeta = {
  source_w?: number;
  source_h?: number;
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
  desktop_virtual_bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  monitor_id?: string | null;
  timestamp?: number;
};

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
): Promise<{
  systemState: SystemState | null;
  screenshot: string | null;
  screenshotContentType: string | null;
  captureMeta: CaptureMeta | null;
}> {
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
          : {
            screenshot: null,
            screenshotContentType: null,
            captureMeta: null,
          };

        return {
          systemState,
          screenshot: screenshotData.screenshot,
          screenshotContentType: screenshotData.screenshotContentType,
          captureMeta: screenshotData.captureMeta,
        };
      } catch (err) {
        console.error(
          `[extractOSstate] Failed to extract OS state (first user message):`,
          err,
        );
        return {
          systemState: null,
          screenshot: null,
          screenshotContentType: null,
          captureMeta: null,
        };
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
      let screenshot: string | null = null;
      let screenshotContentType: string | null = null;
      let captureMeta: CaptureMeta | null = null;

      let resultIndex = 0;
      if (enable_system_state) {
        systemState = results[resultIndex];
        resultIndex++;
      }

      if (enable_screenshot) {
        const screenshotResult = results[resultIndex];
        const screenshotData = extractScreenshotData(screenshotResult);
        screenshot = screenshotData.screenshot;
        screenshotContentType = screenshotData.screenshotContentType;
        captureMeta = screenshotData.captureMeta;
      }

      return {
        systemState,
        screenshot,
        screenshotContentType,
        captureMeta,
      };
    } catch (err) {
      console.error(`[extractOSstate] Failed to extract OS state:`, err);
      return {
        systemState: null,
        screenshot: null,
        screenshotContentType: null,
        captureMeta: null,
      };
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

function extractScreenshotData(result: ToolResult): {
  screenshot: string | null;
  screenshotContentType: string | null;
  captureMeta: CaptureMeta | null;
} {
  if (!result.success || !result.data || typeof result.data !== 'object') {
    return {
      screenshot: null,
      screenshotContentType: null,
      captureMeta: null,
    };
  }

  const screenshot = typeof result.data.screenshot === 'string'
    ? result.data.screenshot
    : null;
  const captureMeta = sanitizeCaptureMeta<CaptureMeta>(result.data.capture_meta);
  const screenshotContentType = resolveScreenshotContentType(result.data);
  return { screenshot, screenshotContentType, captureMeta };
}
