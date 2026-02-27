/**
 * System state and screenshot capture helpers.
 * Pure infrastructure utilities with no React dependencies.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import { getStoredDisplayBounds } from '../../utils/displaySelection';
import type { SystemState, ToolResult } from './MessageFormatter';

const CAPTURE_FOCUS_PREPARE_WAIT_MS = 120;
let activeScreenshotCaptureCount = 0;
let pendingScreenshotCaptureRestore = false;

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

async function prepareExternalFocusForCapture(): Promise<void> {
  try {
    await IpcBridge.invoke(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
      waitMs: CAPTURE_FOCUS_PREPARE_WAIT_MS,
    });
  } catch (error) {
    console.warn('[extractOSstate] Failed to prepare external focus before capture:', error);
  }
}

async function prepareScreenshotCaptureVisibility(): Promise<boolean> {
  activeScreenshotCaptureCount += 1;
  if (activeScreenshotCaptureCount > 1) {
    return true;
  }
  try {
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
    await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
    pendingScreenshotCaptureRestore = true;
    return true;
  } catch (error) {
    activeScreenshotCaptureCount = Math.max(0, activeScreenshotCaptureCount - 1);
    console.warn('[extractOSstate] Failed to hide chat pill before screenshot capture:', error);
    return false;
  }
}

async function restoreScreenshotCaptureVisibility(prepared: boolean): Promise<void> {
  if (!prepared) {
    return;
  }
  activeScreenshotCaptureCount = Math.max(0, activeScreenshotCaptureCount - 1);
  if (activeScreenshotCaptureCount > 0 || !pendingScreenshotCaptureRestore) {
    return;
  }
  try {
    await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
  } catch (error) {
    console.warn('[extractOSstate] Failed to restore chat pill after screenshot capture:', error);
  } finally {
    pendingScreenshotCaptureRestore = false;
  }
}

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
): Promise<{ systemState: SystemState | null; screenshot: string | null; screenshotContentType: string | null }> {
  const shouldEmitCaptureEvent = enable_screenshot && typeof window !== 'undefined';
  let screenshotVisibilityPrepared = false;
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
      screenshotVisibilityPrepared = await prepareScreenshotCaptureVisibility();
    }
    if (enable_screenshot || enable_system_state) {
      await prepareExternalFocusForCapture();
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
          : { screenshot: null, screenshotContentType: null };

        return { systemState, screenshot: screenshotData.screenshot, screenshotContentType: screenshotData.screenshotContentType };
      } catch (err) {
        console.error(
          `[extractOSstate] Failed to extract OS state (first user message):`,
          err,
        );
        return { systemState: null, screenshot: null, screenshotContentType: null };
      }
    }

    // Regular extraction for tool outputs.
    // Include screen_resolution for backend-only coordinate normalization (HiDPI-safe clicks).
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
      }

      return { systemState, screenshot, screenshotContentType };
    } catch (err) {
      console.error(`[extractOSstate] Failed to extract OS state:`, err);
      return { systemState: null, screenshot: null, screenshotContentType: null };
    }
  } finally {
    await restoreScreenshotCaptureVisibility(screenshotVisibilityPrepared);
    if (shouldEmitCaptureEvent) {
      window.dispatchEvent(new CustomEvent('windie:screenshot-capture', {
        detail: { active: false },
      }));
    }
  }
}

export function __resetSystemCaptureStateForTests(): void {
  activeScreenshotCaptureCount = 0;
  pendingScreenshotCaptureRestore = false;
}

function resolveScreenshotContentType(data: Record<string, any>): string | null {
  const format = (data.compression || data.format || '').toString().toLowerCase();
  if (format === 'jpeg' || format === 'jpg') {
    return 'image/jpeg';
  }
  if (format === 'png') {
    return 'image/png';
  }
  return null;
}

function extractScreenshotData(result: ToolResult): {
  screenshot: string | null;
  screenshotContentType: string | null;
} {
  if (!result.success || !result.data || typeof result.data !== 'object') {
    return { screenshot: null, screenshotContentType: null };
  }

  const screenshot = typeof result.data.screenshot === 'string'
    ? result.data.screenshot
    : null;
  const screenshotContentType = resolveScreenshotContentType(result.data);
  return { screenshot, screenshotContentType };
}
