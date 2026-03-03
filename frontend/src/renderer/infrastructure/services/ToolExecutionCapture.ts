import { extractOSstate } from './SystemCapture';
import { STANDARD_COMPUTER_USE_TOOLS } from './ToolComputerUseCatalog';
import type { SystemState, ToolResult } from './MessageFormatter';
import type { CaptureMeta } from './SystemCapture';
import {
  resolveScreenshotContentType,
  sanitizeCaptureMeta,
} from './CapturePayloadUtils';

type ToolCaptureResult = {
  screenshot: string | null;
  screenshotContentType: string | null;
  captureMeta: CaptureMeta | null;
  systemState: SystemState | null;
  waitSeconds: number;
  captureTime: number;
};

type AutoCaptureResult = {
  screenshot: string | null;
  screenshotContentType: string | null;
  captureMeta: CaptureMeta | null;
  systemState: SystemState | null;
  waitDelay: number;
  captureTime: number;
  isComputerTool: boolean;
};

const DEFAULT_COMPUTER_TOOL_WAIT_SECONDS = 2;
const DEFAULT_SCREENSHOT_WAIT_SECONDS = 0;

export function isComputerUseTool(toolName: string, args: any): boolean {
  const isStandardComputerUseTool = STANDARD_COMPUTER_USE_TOOLS.includes(toolName);
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
  captureMeta: CaptureMeta | null;
  systemState: SystemState | null;
} {
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    const screenshotContentType = resolveScreenshotContentType(result.data);
    const screenshot = resolveScreenshotValue(result.data);
    const captureMeta = sanitizeCaptureMeta<CaptureMeta>(result.data.capture_meta);
    return {
      screenshot,
      screenshotContentType,
      captureMeta,
      systemState: result.data.system_state || null
    };
  }
  return {
    screenshot: null,
    screenshotContentType: null,
    captureMeta: null,
    systemState: null,
  };
}

function applyCaptureToResult(
  result: ToolResult,
  screenshot: string | null,
  captureMeta: CaptureMeta | null,
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
      capture_meta: captureMeta ?? undefined,
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
  result: ToolResult,
  captureCorrelationId?: string | null,
): Promise<AutoCaptureResult> {
  const isComputerTool = isComputerUseTool(toolName, args);
  let {
    screenshot,
    screenshotContentType,
    captureMeta,
    systemState,
  } = extractCaptureFromResult(result);
  let waitDelay = 0;
  let captureTime = 0;

  const shouldCapture = !skipAutoCapture && !screenshot && (isComputerTool || toolName === 'screenshot');
  if (shouldCapture) {
    const capture = await captureAfterTool(
      toolName,
      args,
      true,
      getDefaultWaitSeconds(toolName),
      captureCorrelationId,
    );
    waitDelay = capture.waitSeconds;
    captureTime = capture.captureTime;
    systemState = capture.systemState;
    screenshot = capture.screenshot;
    screenshotContentType = capture.screenshotContentType;
    captureMeta = capture.captureMeta;
    applyCaptureToResult(
      result,
      screenshot,
      captureMeta,
      systemState,
      screenshotContentType,
    );
  } else {
    const shouldCaptureSystemStateOnly = (
      !skipAutoCapture
      && Boolean(screenshot)
      && !systemState
      && (isComputerTool || toolName === 'screenshot')
    );
    if (shouldCaptureSystemStateOnly) {
      const stateCapture = await captureSystemStateAfterTool(
        toolName,
        args,
        getDefaultWaitSeconds(toolName),
        captureCorrelationId,
      );
      waitDelay = stateCapture.waitSeconds;
      captureTime = stateCapture.captureTime;
      systemState = stateCapture.systemState;
      applyCaptureToResult(
        result,
        screenshot,
        captureMeta,
        systemState,
        screenshotContentType,
      );
    }
  }

  return {
    screenshot,
    screenshotContentType,
    captureMeta,
    systemState,
    waitDelay,
    captureTime,
    isComputerTool
  };
}

async function captureSystemStateAfterTool(
  toolName: string,
  args: any,
  defaultWaitSeconds: number,
  captureCorrelationId?: string | null,
): Promise<Pick<ToolCaptureResult, 'systemState' | 'waitSeconds' | 'captureTime'>> {
  const waitSeconds = getWaitSeconds(toolName, args, defaultWaitSeconds);
  const captureStartTime = performance.now();
  const captureResult = await extractOSstate(
    false,
    true,
    waitSeconds,
    false,
    captureCorrelationId,
  );
  const captureTime = (performance.now() - captureStartTime) / 1000;
  return {
    systemState: captureResult.systemState,
    waitSeconds,
    captureTime,
  };
}

export async function captureAfterTool(
  toolName: string,
  args: any,
  enableSystemState: boolean,
  defaultWaitSeconds: number,
  captureCorrelationId?: string | null,
): Promise<ToolCaptureResult> {
  const waitSeconds = getWaitSeconds(toolName, args, defaultWaitSeconds);
  const captureStartTime = performance.now();
  const captureResult = await extractOSstate(
    true,
    enableSystemState,
    waitSeconds,
    false,
    captureCorrelationId,
  );
  const captureTime = (performance.now() - captureStartTime) / 1000;
  return {
    screenshot: captureResult.screenshot,
    screenshotContentType: captureResult.screenshotContentType,
    captureMeta: captureResult.captureMeta,
    systemState: enableSystemState ? captureResult.systemState : null,
    waitSeconds,
    captureTime
  };
}

function resolveScreenshotValue(data: Record<string, any>): string | null {
  if (typeof data.screenshot === 'string') {
    return data.screenshot;
  }
  if (typeof data.image_data === 'string') {
    return data.image_data;
  }
  if (typeof data.screenshot_ref === 'string' && data.screenshot_ref.trim().length > 0) {
    return `artifact://${data.screenshot_ref.trim()}`;
  }
  if (typeof data.screenshot_url === 'string' && data.screenshot_url.trim().length > 0) {
    return data.screenshot_url.trim();
  }
  return null;
}
