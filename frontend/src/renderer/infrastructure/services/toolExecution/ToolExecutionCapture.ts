import {
  captureScreenshotAttachment,
  extractScreenshotAttachment,
  hasScreenshotAttachment,
  type CaptureMeta,
  type ScreenshotAttachment,
} from '../ScreenshotAttachmentPipeline';
import { captureSystemState } from '../SystemStateCapture';
import { STANDARD_COMPUTER_USE_TOOLS } from '../ToolComputerUseCatalog';
import type { SystemState, ToolResult } from '../MessageFormatter';

type ToolCaptureResult = {
  screenshot: string | null;
  screenshotRef: string | null;
  screenshotUrl: string | null;
  screenshotContentType: string | null;
  captureMeta: CaptureMeta | null;
  systemState: SystemState | null;
  waitSeconds: number;
  captureTime: number;
};

type AutoCaptureResult = {
  screenshot: string | null;
  screenshotRef: string | null;
  screenshotUrl: string | null;
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
  screenshotRef: string | null;
  screenshotUrl: string | null;
  screenshotContentType: string | null;
  captureMeta: CaptureMeta | null;
  systemState: SystemState | null;
} {
  const attachment = extractScreenshotAttachment(result);
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    return {
      screenshot: attachment.screenshot,
      screenshotRef: attachment.screenshotRef,
      screenshotUrl: attachment.screenshotUrl,
      screenshotContentType: attachment.screenshotContentType,
      captureMeta: attachment.captureMeta,
      systemState: result.data.system_state || null,
    };
  }
  return {
    screenshot: null,
    screenshotRef: null,
    screenshotUrl: null,
    screenshotContentType: null,
    captureMeta: null,
    systemState: null,
  };
}

function applyCaptureToResult(
  result: ToolResult,
  attachment: ScreenshotAttachment,
  systemState: SystemState | null,
): void {
  if (
    !hasScreenshotAttachment(attachment)
    && !systemState
  ) {
    return;
  }
  if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
    result.data = {
      ...result.data,
      screenshot: attachment.screenshot ?? undefined,
      screenshot_ref: attachment.screenshotRef ?? undefined,
      screenshot_url: attachment.screenshotUrl ?? undefined,
      capture_meta: attachment.captureMeta ?? undefined,
      system_state: systemState ?? undefined,
      screenshot_content_type: attachment.screenshotContentType ?? undefined,
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
    screenshotRef,
    screenshotUrl,
    screenshotContentType,
    captureMeta,
    systemState,
  } = extractCaptureFromResult(result);
  let waitDelay = 0;
  let captureTime = 0;

  const hasExistingAttachment = hasScreenshotAttachment({
    screenshot,
    screenshotRef,
    screenshotUrl,
    screenshotContentType,
    captureMeta,
  });
  const shouldCapture = !skipAutoCapture && !hasExistingAttachment && (isComputerTool || toolName === 'screenshot');
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
    screenshotRef = capture.screenshotRef;
    screenshotUrl = capture.screenshotUrl;
    screenshotContentType = capture.screenshotContentType;
    captureMeta = capture.captureMeta;
    applyCaptureToResult(
      result,
      {
        screenshot,
        screenshotRef,
        screenshotUrl,
        screenshotContentType,
        captureMeta,
      },
      systemState,
    );
  } else {
    const shouldCaptureSystemStateOnly = (
      !skipAutoCapture
      && hasExistingAttachment
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
        {
          screenshot,
          screenshotRef,
          screenshotUrl,
          screenshotContentType,
          captureMeta,
        },
        systemState,
      );
    }
  }

  return {
    screenshot,
    screenshotRef,
    screenshotUrl,
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
  const systemState = await captureSystemState({
    waitSeconds,
    correlationId: captureCorrelationId,
  });
  const captureTime = (performance.now() - captureStartTime) / 1000;
  return {
    systemState,
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
  const screenshotAttachment = await captureScreenshotAttachment({
    waitSeconds,
    correlationId: captureCorrelationId,
  });
  const systemState = enableSystemState
    ? await captureSystemState({
        waitSeconds: 0,
        correlationId: captureCorrelationId,
      })
    : null;
  const captureTime = (performance.now() - captureStartTime) / 1000;
  return {
    screenshot: screenshotAttachment.screenshot,
    screenshotRef: screenshotAttachment.screenshotRef,
    screenshotUrl: screenshotAttachment.screenshotUrl,
    screenshotContentType: screenshotAttachment.screenshotContentType,
    captureMeta: screenshotAttachment.captureMeta,
    systemState,
    waitSeconds,
    captureTime
  };
}
