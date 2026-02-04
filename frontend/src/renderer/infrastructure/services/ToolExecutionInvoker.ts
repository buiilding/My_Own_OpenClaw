import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import type { ToolResult } from './MessageFormatter';

export type ToolInvokeOutcome = {
  result: ToolResult;
  toolInvokeTime: number;
};

export async function invokeTool(
  toolName: string,
  args: any,
  skipAutoCapture: boolean
): Promise<ToolInvokeOutcome> {
  const toolInvokeStartTime = performance.now();
  const result: ToolResult = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
    toolName,
    args,
    skipAutoCapture
  });
  const toolInvokeTime = (performance.now() - toolInvokeStartTime) / 1000;
  return { result, toolInvokeTime };
}
