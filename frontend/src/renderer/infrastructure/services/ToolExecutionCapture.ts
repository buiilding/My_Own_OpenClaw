import { extractOSstate } from './SystemCapture';
import { COMPUTER_USE_TOOLS } from './ToolExecutionTypes';
import type { SystemState, ToolResult } from './MessageFormatter';

export type ToolCaptureResult = {
  screenshot: string | null;
  systemState: SystemState | null;
  waitSeconds: number;
  captureTime: number;
};

export type AutoCaptureResult = {
  screenshot: string | null;
  systemState: SystemState | null;
  waitDelay: number;
  captureTime: number;
  isComputerTool: boolean;
};

const DEFAULT_COMPUTER_TOOL_WAIT_SECONDS = 2;
const DEFAULT_SCREENSHOT_WAIT_SECONDS = 0;

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

export function extractCaptureFromResult(result: ToolResult): {
  screenshot: string | null;
  systemState: SystemState | null;
} {
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    return {
      screenshot: result.data.screenshot || null,
      systemState: result.data.system_state || null
    };
  }
  return { screenshot: null, systemState: null };
}

export function applyCaptureToResult(
  result: ToolResult,
  screenshot: string | null,
  systemState: SystemState | null
): void {
  if (!screenshot) {
    return;
  }
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    result.data = {
      ...result.data,
      screenshot,
      system_state: systemState ?? undefined
    };
  }
}

export function resolveSystemState(
  systemState: SystemState | null,
  data: ToolResult['data']
): SystemState | null {
  if (systemState) {
    return systemState;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return (data.system_state as SystemState | undefined) || null;
  }
  return null;
}

function getDefaultWaitSeconds(toolName: string): number {
  return toolName === 'screenshot'
    ? DEFAULT_SCREENSHOT_WAIT_SECONDS
    : DEFAULT_COMPUTER_TOOL_WAIT_SECONDS;
}

export async function ensureAutoCapture(
  toolName: string,
  args: any,
  skipAutoCapture: boolean | undefined,
  result: ToolResult
): Promise<AutoCaptureResult> {
  const isComputerTool = isComputerUseTool(toolName, args);
  let { screenshot, systemState } = extractCaptureFromResult(result);
  let waitDelay = 0;
  let captureTime = 0;

  const shouldCapture = !skipAutoCapture && !screenshot && (isComputerTool || toolName === 'screenshot');
  if (shouldCapture) {
    const capture = await captureAfterTool(
      toolName,
      args,
      true,
      getDefaultWaitSeconds(toolName)
    );
    waitDelay = capture.waitSeconds;
    captureTime = capture.captureTime;
    systemState = capture.systemState;
    screenshot = capture.screenshot;
    applyCaptureToResult(result, screenshot, systemState);
  }

  return {
    screenshot,
    systemState,
    waitDelay,
    captureTime,
    isComputerTool
  };
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
