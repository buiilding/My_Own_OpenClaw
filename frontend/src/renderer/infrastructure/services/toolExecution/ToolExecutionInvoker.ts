import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';
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
  const screenshotArgs = toolName === 'screenshot'
    ? (args && typeof args === 'object' && !Array.isArray(args) ? args : {})
    : null;
  const toolArgs =
    toolName === 'screenshot'
      ? screenshotArgs
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
