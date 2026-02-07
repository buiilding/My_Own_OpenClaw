import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import { captureAfterTool, isComputerUseTool } from './ToolExecutionCapture';
import { logBundledToolTiming } from './ToolExecutionLogger';
import type { SystemState, ToolResult } from './MessageFormatter';

export type BundleStepResult = {
  tool: string;
  status: 'ok' | 'error';
  output: string;
};

export type BundleRunOutcome = {
  stepResults: BundleStepResult[];
  systemState: SystemState | null;
  screenshot: string | null;
  screenshotContentType: string | null;
  totalWaitDelay: number;
  totalCaptureTime: number;
  toolExecutionTimes: Array<{ tool: string; time: number }>;
};

function resolveStepOutput(result: ToolResult, toolName: string): string {
  if (result.data && typeof result.data === 'object' && result.data.output) {
    return String(result.data.output);
  }
  if (result.success) {
    return `Tool ${toolName} executed successfully`;
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
      console.log(`[ToolExecutionService] Executing bundled tool ${i + 1}/${bundle.length}: ${tool.toolName}`);

      const result: ToolResult = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
        toolName: tool.toolName,
        args: tool.args,
        skipAutoCapture: true
      });

      const toolExecutionTime = (performance.now() - toolStartTime) / 1000;
      toolExecutionTimes.push({ tool: tool.toolName, time: toolExecutionTime });
      logBundledToolTiming(tool.toolName, toolExecutionTime);

      stepResults.push({
        tool: tool.toolName,
        status: result.success ? 'ok' : 'error',
        output: resolveStepOutput(result, tool.toolName)
      });

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
      toolExecutionTimes.push({ tool: tool.toolName, time: toolExecutionTime });
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(
        `[ToolExecutionService] Bundle tool execution failed: ${tool.toolName} ` +
        `(took ${toolExecutionTime.toFixed(3)}s):`,
        err
      );

      stepResults.push({
        tool: tool.toolName,
        status: 'error',
        output: errorMessage
      });

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
