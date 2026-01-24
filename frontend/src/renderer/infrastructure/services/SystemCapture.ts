/**
 * System state and screenshot capture helpers.
 * Pure infrastructure utilities with no React dependencies.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import type { SystemState, ToolResult } from './MessageFormatter';

/**
 * Capture system state and screenshot after tool or bundle execution.
 * This is called ONCE after individual tool execution or ONCE after all bundled tools.
 *
 * @param context - Context string for logging (e.g., "after keyboard_control" or "after bundle")
 * @param waitMilliseconds - Optional delay in milliseconds before capturing (defaults to 2000ms)
 * @returns Object with systemState and screenshot, or nulls if capture failed
 */
export async function captureSystemStateAndScreenshot(
  context: string,
  waitMilliseconds: number = 2000,
): Promise<{ systemState: SystemState | null; screenshot: string | null }> {
  // Wait for specified delay (default 2 seconds) for UI to update before capturing
  await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));

  try {
    // Get system state and screenshot in parallel
    const [stateResult, screenshotResult] = await Promise.all([
      IpcBridge.invoke<SystemState>(INVOKE_CHANNELS.GET_SYSTEM_STATE),
      IpcBridge.invoke<ToolResult>(INVOKE_CHANNELS.EXECUTE_TOOL, {
        toolName: 'screenshot',
        args: {
          explanation: `Screenshot ${context}`,
          expectation: `State ${context}`,
        },
        skipAutoCapture: false,
      }),
    ]);

    const systemState = stateResult;
    const screenshot =
      screenshotResult.success &&
      screenshotResult.data &&
      typeof screenshotResult.data === 'object'
        ? screenshotResult.data.screenshot || null
        : null;

    return { systemState, screenshot };
  } catch (err) {
    console.error(
      `[ToolExecutionService] Failed to capture system state/screenshot ${context}:`,
      err,
    );
    return { systemState: null, screenshot: null };
  }
}

