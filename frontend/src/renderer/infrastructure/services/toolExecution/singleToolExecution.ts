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
import { logRendererToolScreenshotDebug } from './ToolScreenshotDebugTrace';
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

    logRendererToolScreenshotDebug('post-capture', {
      toolName,
      correlationId: options.correlationId,
      isComputerTool,
      hasCaptureScreenshot: Boolean(screenshot),
      captureScreenshotLength: typeof screenshot === 'string' ? screenshot.length : 0,
      captureScreenshotContentType: screenshotContentType,
      hasSystemState: Boolean(systemState),
      resultHasScreenshot: Boolean(
        result?.data
        && typeof result.data === 'object'
        && !Array.isArray(result.data)
        && (
          'screenshot' in result.data
          || 'image_data' in result.data
          || 'screenshot_ref' in result.data
        )
      ),
    });

    const screenshotSelection = resolveToolExecutionScreenshotSelection(
      toolName,
      screenshot,
      screenshotContentType,
      result,
    );
    const effectiveScreenshot = screenshotSelection.screenshot;
    const effectiveScreenshotContentType = screenshotSelection.screenshotContentType;

    logRendererToolScreenshotDebug('selection', {
      toolName,
      correlationId: options.correlationId,
      selectedHasInlineScreenshot: Boolean(effectiveScreenshot),
      selectedInlineScreenshotLength: typeof effectiveScreenshot === 'string' ? effectiveScreenshot.length : 0,
      selectedScreenshotContentType: effectiveScreenshotContentType,
      preUploadedScreenshotRef: screenshotSelection.preUploadedScreenshot?.screenshotRef || null,
      preUploadedScreenshotUrl: screenshotSelection.preUploadedScreenshot?.screenshotUrl || null,
      uploadFilename: screenshotSelection.uploadFilename || null,
    });

    const uploaded = effectiveScreenshot
      ? await uploadArtifactBase64(
          effectiveScreenshot,
          screenshotSelection.uploadContentType,
          screenshotSelection.uploadFilename || `${toolName}-screenshot.png`,
        )
      : null;
    const screenshotRef = uploaded?.artifactId || screenshotSelection.preUploadedScreenshot?.screenshotRef || null;
    const screenshotUrl = uploaded?.url || screenshotSelection.preUploadedScreenshot?.screenshotUrl || null;

    logRendererToolScreenshotDebug('post-upload', {
      toolName,
      correlationId: options.correlationId,
      uploadReturnedArtifact: Boolean(uploaded),
      uploadedArtifactId: uploaded?.artifactId || null,
      uploadedUrl: uploaded?.url || null,
      finalScreenshotRef: screenshotRef,
      finalScreenshotUrl: screenshotUrl,
      finalKeepsInlineScreenshot: !screenshotRef && Boolean(effectiveScreenshot),
    });

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

    logRendererToolScreenshotDebug('before-backend-send', {
      toolName,
      correlationId: options.correlationId,
      includeScreenshot: isComputerTool,
      backendWillSendScreenshotRef: screenshotRef,
      backendWillSendInlineScreenshot: screenshotRef ? null : Boolean(effectiveScreenshot),
    });

    sendToolExecutionResultToBackend(callbacks, {
      correlationId: options.correlationId,
      result,
      formattedMessage,
      systemState: finalSystemState,
      includeScreenshot: isComputerTool,
      screenshot: screenshotRef ? null : effectiveScreenshot,
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
