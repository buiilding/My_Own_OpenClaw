import { formatToolOutputMessage } from '../MessageFormatter';
import { uploadArtifactBase64 } from '../ArtifactUploader';
import {
  ensureAutoCapture,
  resolveSystemState,
} from './ToolExecutionCapture';
import { invokeTool } from './ToolExecutionInvoker';
import { logToolStart, logToolTiming } from './ToolExecutionLogger';
import { resolveToolExecutionScreenshotSelection } from './ToolExecutionScreenshotSelection';
import {
  emitToolExecutionResult,
  sendToolExecutionResultToBackend,
} from './ToolExecutionResultDispatch';
import type { ToolExecutionCallbacks, ToolExecutionOptions, ToolExecutionResult } from './ToolExecutionTypes';

export async function executeSingleTool(
  callbacks: ToolExecutionCallbacks,
  toolName: string,
  args: any,
  options: ToolExecutionOptions,
): Promise<ToolExecutionResult> {
  const totalStartTime = performance.now();
  const shortId = logToolStart(toolName, options.correlationId);

  try {
    const { result, toolInvokeTime } = await invokeTool(
      toolName,
      args,
      options.skipAutoCapture || false,
    );
    const capture = await ensureAutoCapture(
      toolName,
      args,
      options.skipAutoCapture,
      result,
      options.correlationId,
    );
    const {
      screenshot,
      screenshotContentType,
      systemState,
      waitDelay,
      captureTime,
      isComputerTool,
    } = capture;

    const screenshotSelection = resolveToolExecutionScreenshotSelection(
      toolName,
      screenshot,
      screenshotContentType,
      result,
    );
    const effectiveScreenshot = screenshotSelection.screenshot;
    const effectiveScreenshotContentType = screenshotSelection.screenshotContentType;
    const uploaded = effectiveScreenshot
      ? await uploadArtifactBase64(
          effectiveScreenshot,
          screenshotSelection.uploadContentType,
          screenshotSelection.uploadFilename || `${toolName}-screenshot.png`,
        )
      : null;
    const screenshotRef = uploaded?.artifactId || screenshotSelection.preUploadedScreenshot?.screenshotRef || null;
    const screenshotUrl = uploaded?.url || screenshotSelection.preUploadedScreenshot?.screenshotUrl || null;

    const finalSystemState = resolveSystemState(systemState, result.data);
    const formattedMessage = formatToolOutputMessage(
      toolName,
      result,
      finalSystemState,
      isComputerTool,
    );

    const executionResult: ToolExecutionResult = {
      toolName,
      result,
      executionTime: 0,
      correlationId: options.correlationId,
      formattedMessage,
      screenshot: effectiveScreenshot,
      screenshotRef,
      screenshotUrl,
      screenshotContentType: effectiveScreenshotContentType,
      systemState: finalSystemState,
    };
    // Preserve existing UI-before-backend ordering so transcript and chat rows appear immediately.
    emitToolExecutionResult(callbacks, executionResult);

    sendToolExecutionResultToBackend(callbacks, {
      correlationId: options.correlationId,
      result,
      formattedMessage,
      systemState: finalSystemState,
      includeScreenshot: isComputerTool,
      screenshotRef,
      includeSystemState: isComputerTool,
    });

    const totalExecutionTime = (performance.now() - totalStartTime) / 1000;
    executionResult.executionTime = totalExecutionTime;
    logToolTiming({
      toolName,
      totalExecutionTime,
      toolInvokeTime,
      waitDelay,
      captureTime,
      shortId,
      isComputerTool,
      skipAutoCapture: options.skipAutoCapture,
    });
    return executionResult;
  } catch (error: unknown) {
    const failure = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    } as const;
    const errorExecutionTime = (performance.now() - totalStartTime) / 1000;
    console.error(
      `[ToolExecutionService] Tool execution failed: ${
        error instanceof Error ? error.message : String(error)
      } (took ${errorExecutionTime.toFixed(3)}s)`,
    );
    const errorResult: ToolExecutionResult = {
      toolName,
      result: failure,
      executionTime: errorExecutionTime,
      correlationId: options.correlationId,
      formattedMessage: formatToolOutputMessage(toolName, failure, null),
      screenshot: null,
      systemState: null,
    };
    emitToolExecutionResult(callbacks, errorResult);
    sendToolExecutionResultToBackend(callbacks, {
      correlationId: options.correlationId,
      result: errorResult.result,
      formattedMessage: errorResult.formattedMessage,
      systemState: null,
      includeScreenshot: false,
      screenshotRef: null,
      includeSystemState: false,
    });
    throw error;
  }
}
