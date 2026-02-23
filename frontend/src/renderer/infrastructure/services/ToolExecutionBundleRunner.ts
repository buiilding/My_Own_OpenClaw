import { captureAfterTool, isComputerUseTool } from './ToolExecutionCapture';
import { logBundledToolStart, logBundledToolTiming } from './ToolExecutionLogger';
import { invokeTool } from './ToolExecutionInvoker';
import type { SystemState, ToolResult } from './MessageFormatter';

export type BundleStepResult = {
  tool: string;
  status: 'ok' | 'error';
  output: string;
};

type BundleRunOutcome = {
  stepResults: BundleStepResult[];
  systemState: SystemState | null;
  screenshot: string | null;
  screenshotContentType: string | null;
  totalWaitDelay: number;
  totalCaptureTime: number;
  toolExecutionTimes: Array<{ tool: string; time: number }>;
};

function recordToolTiming(
  toolExecutionTimes: Array<{ tool: string; time: number }>,
  toolName: string,
  toolExecutionTime: number,
): void {
  toolExecutionTimes.push({ tool: toolName, time: toolExecutionTime });
  logBundledToolTiming(toolName, toolExecutionTime);
}

function appendStepResult(
  stepResults: BundleStepResult[],
  toolName: string,
  status: BundleStepResult['status'],
  output: string,
): void {
  stepResults.push({
    tool: toolName,
    status,
    output,
  });
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string' && err.length > 0) {
    return err;
  }
  return 'Unknown error';
}

function resolveStepOutput(result: ToolResult, toolName: string): string {
  if (typeof result.data === 'string' && result.data.length > 0) {
    return result.data;
  }

  if (result.data && typeof result.data === 'object') {
    const preferredKeys = ['llm_content', 'output', 'content', 'message', 'result', 'return_display'];
    for (const key of preferredKeys) {
      const value = (result.data as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (value !== undefined && value !== null) {
        return String(value);
      }
    }
  }
  if (result.success) {
    return `Tool ${toolName} executed successfully (no output)`;
  }
  return result.error || 'Unknown error';
}

export async function runToolBundle(
  bundle: Array<{ toolName: string; args: any }>
): Promise<BundleRunOutcome> {
  const stepResults: BundleStepResult[] = [];
  const toolExecutionTimes: Array<{ tool: string; time: number }> = [];
  let systemState: SystemState | null = null;
  let screenshot: string | null = null;
  let screenshotContentType: string | null = null;
  let totalWaitDelay = 0;
  let totalCaptureTime = 0;

  for (let i = 0; i < bundle.length; i++) {
    const tool = bundle[i];
    const toolStartTime = performance.now();

    try {
      logBundledToolStart(i + 1, bundle.length, tool.toolName);

      const { result, toolInvokeTime } = await invokeTool(
        tool.toolName,
        tool.args,
        true
      );
      const toolExecutionTime = toolInvokeTime;
      recordToolTiming(toolExecutionTimes, tool.toolName, toolExecutionTime);

      appendStepResult(
        stepResults,
        tool.toolName,
        result.success ? 'ok' : 'error',
        resolveStepOutput(result, tool.toolName),
      );

      if (!result.success) {
        console.error(`[ToolExecutionService] Tool ${tool.toolName} failed, stopping bundle execution (fail-fast)`);
        break;
      }

      const isComputerTool = isComputerUseTool(tool.toolName, tool.args);
      if (isComputerTool) {
        const isLastTool = i === bundle.length - 1;
        const capture = await captureAfterTool(
          tool.toolName,
          tool.args,
          isLastTool,
          0
        );
        totalCaptureTime += capture.captureTime;
        totalWaitDelay += capture.waitSeconds;
        screenshot = capture.screenshot;
        screenshotContentType = capture.screenshotContentType;
        if (isLastTool) {
          systemState = capture.systemState;
        }
      }
    } catch (err: unknown) {
      const toolExecutionTime = (performance.now() - toolStartTime) / 1000;
      recordToolTiming(toolExecutionTimes, tool.toolName, toolExecutionTime);
      const errorMessage = getErrorMessage(err);
      console.error(
        `[ToolExecutionService] Bundle tool execution failed: ${tool.toolName} ` +
        `(took ${toolExecutionTime.toFixed(3)}s):`,
        err
      );

      appendStepResult(stepResults, tool.toolName, 'error', errorMessage);

      break;
    }
  }

  return {
    stepResults,
    systemState,
    screenshot,
    screenshotContentType,
    totalWaitDelay,
    totalCaptureTime,
    toolExecutionTimes
  };
}
