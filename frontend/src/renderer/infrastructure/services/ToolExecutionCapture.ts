import { extractOSstate } from './SystemCapture';
import { COMPUTER_USE_TOOLS } from './ToolExecutionTypes';
import type { SystemState } from './MessageFormatter';

export type ToolCaptureResult = {
  screenshot: string | null;
  systemState: SystemState | null;
  waitSeconds: number;
  captureTime: number;
};

export function isComputerUseTool(toolName: string, args: any): boolean {
  const isStandardComputerUseTool = (COMPUTER_USE_TOOLS as string[]).includes(toolName);
  const isRunShellCommandWithWait =
    toolName === 'run_shell_command' &&
    args &&
    typeof args === 'object' &&
    typeof args.wait === 'number' &&
    args.wait > 0;
  return isStandardComputerUseTool || isRunShellCommandWithWait;
}

export function getWaitSeconds(
  toolName: string,
  args: any,
  defaultWaitSeconds: number
): number {
  if (toolName === 'wait' && args && typeof args === 'object' && typeof args.seconds === 'number') {
    return args.seconds;
  }
  if (args && typeof args === 'object' && typeof args.wait === 'number') {
    return args.wait;
  }
  return defaultWaitSeconds;
}

export async function captureAfterTool(
  toolName: string,
  args: any,
  enableSystemState: boolean,
  defaultWaitSeconds: number
): Promise<ToolCaptureResult> {
  const waitSeconds = getWaitSeconds(toolName, args, defaultWaitSeconds);
  const captureStartTime = performance.now();
  const captureResult = await extractOSstate(
    true,
    enableSystemState,
    waitSeconds,
    false
  );
  const captureTime = (performance.now() - captureStartTime) / 1000;
  return {
    screenshot: captureResult.screenshot,
    systemState: enableSystemState ? captureResult.systemState : null,
    waitSeconds,
    captureTime
  };
}
