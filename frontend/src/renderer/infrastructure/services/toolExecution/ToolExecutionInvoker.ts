import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';
import { getStoredDisplayBounds } from '../../../utils/displaySelection';
import type { ToolResult } from '../MessageFormatter';

type ToolInvokeOutcome = {
  result: ToolResult;
  toolInvokeTime: number;
};

export async function invokeTool(
  toolName: string,
  args: any,
  skipAutoCapture: boolean
): Promise<ToolInvokeOutcome> {
  const displayBounds = toolName === 'screenshot' ? getStoredDisplayBounds() : null;
  const screenshotArgs = toolName === 'screenshot'
    ? (args && typeof args === 'object' && !Array.isArray(args) ? args : {})
    : null;
  const toolArgs =
    toolName === 'screenshot'
      ? (displayBounds ? { ...screenshotArgs, display_bounds: displayBounds } : screenshotArgs)
      : args;
  const toolInvokeStartTime = performance.now();
  const result: ToolResult = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
    toolName,
    args: toolArgs,
    skipAutoCapture
  });
  const toolInvokeTime = (performance.now() - toolInvokeStartTime) / 1000;
  return { result, toolInvokeTime };
}
