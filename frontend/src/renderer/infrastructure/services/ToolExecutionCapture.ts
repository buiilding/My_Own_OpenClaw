import { extractOSstate } from './SystemCapture';
import { COMPUTER_USE_TOOLS } from './ToolExecutionTypes';
import type { SystemState, ToolResult } from './MessageFormatter';

type ToolCaptureResult = {
  screenshot: string | null;
  screenshotContentType: string | null;
  systemState: SystemState | null;
  waitSeconds: number;
  captureTime: number;
};

type AutoCaptureResult = {
  screenshot: string | null;
  screenshotContentType: string | null;
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

function getWaitSeconds(
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

function extractCaptureFromResult(result: ToolResult): {
  screenshot: string | null;
  screenshotContentType: string | null;
  systemState: SystemState | null;
} {
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    const screenshotContentType = resolveContentType(result.data);
    const screenshot = resolveScreenshotValue(result.data);
    return {
      screenshot,
      screenshotContentType,
      systemState: result.data.system_state || null
    };
  }
  return { screenshot: null, screenshotContentType: null, systemState: null };
}

function applyCaptureToResult(
  result: ToolResult,
  screenshot: string | null,
  systemState: SystemState | null,
  screenshotContentType: string | null
): void {
  if (!screenshot) {
    return;
  }
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    result.data = {
      ...result.data,
      screenshot,
      system_state: systemState ?? undefined,
      screenshot_content_type: screenshotContentType ?? undefined
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
  let { screenshot, screenshotContentType, systemState } = extractCaptureFromResult(result);
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
    screenshotContentType = capture.screenshotContentType;
    applyCaptureToResult(result, screenshot, systemState, screenshotContentType);
  }

  return {
    screenshot,
    screenshotContentType,
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
    screenshotContentType: captureResult.screenshotContentType,
    systemState: enableSystemState ? captureResult.systemState : null,
    waitSeconds,
    captureTime
  };
}

function resolveContentType(data: Record<string, any>): string | null {
  const format = (data.screenshot_content_type || data.compression || data.format || '').toString().toLowerCase();
  if (format === 'image/png' || format === 'png') {
    return 'image/png';
  }
  if (format === 'image/jpeg' || format === 'jpeg' || format === 'jpg') {
    return 'image/jpeg';
  }
  return null;
}

function resolveScreenshotValue(data: Record<string, any>): string | null {
  if (typeof data.screenshot === 'string') {
    return data.screenshot;
  }
  if (typeof data.image_data === 'string') {
    return data.image_data;
  }
  return null;
}
