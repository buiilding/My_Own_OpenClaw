import { formatToolOutputMessage } from '../MessageFormatter';
import {
  extractScreenshotAttachment,
  hasScreenshotAttachment,
  materializeScreenshotAttachment,
} from '../ScreenshotAttachmentPipeline';
import {
  ensureAutoCapture,
  resolveSystemState,
} from './ToolExecutionCapture';
import { invokeTool } from './ToolExecutionInvoker';
import { logToolStart, logToolTiming } from './ToolExecutionLogger';
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
      screenshotRef,
      screenshotUrl,
      screenshotContentType,
      captureMeta,
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

    const resultAttachment = extractScreenshotAttachment(result);
    const selectedAttachment = hasScreenshotAttachment({
      screenshot,
      screenshotRef,
      screenshotUrl,
      screenshotContentType,
      captureMeta,
    })
      ? {
          screenshot,
          screenshotRef,
          screenshotUrl,
          screenshotContentType,
          captureMeta,
        }
      : resultAttachment;

    logRendererToolScreenshotDebug('selection', {
      toolName,
      correlationId: options.correlationId,
      selectedHasInlineScreenshot: Boolean(selectedAttachment.screenshot),
      selectedInlineScreenshotLength: typeof selectedAttachment.screenshot === 'string' ? selectedAttachment.screenshot.length : 0,
      selectedScreenshotContentType: selectedAttachment.screenshotContentType,
      preUploadedScreenshotRef: selectedAttachment.screenshotRef || null,
      preUploadedScreenshotUrl: selectedAttachment.screenshotUrl || null,
      uploadFilename: selectedAttachment.screenshot
        ? `${toolName}-screenshot`
        : null,
    });

    const materializedAttachment = await materializeScreenshotAttachment(
      selectedAttachment,
      { filenameStem: `${toolName}-screenshot` },
    );

    logRendererToolScreenshotDebug('post-upload', {
      toolName,
      correlationId: options.correlationId,
      uploadReturnedArtifact: Boolean(materializedAttachment.screenshotRef || materializedAttachment.screenshotUrl),
      uploadedArtifactId: materializedAttachment.screenshotRef || null,
      uploadedUrl: materializedAttachment.screenshotUrl || null,
      finalScreenshotRef: materializedAttachment.screenshotRef,
      finalScreenshotUrl: materializedAttachment.screenshotUrl,
      finalKeepsInlineScreenshot: !materializedAttachment.screenshotRef && Boolean(materializedAttachment.screenshot),
    });

    const finalSystemState = resolveSystemState(systemState, result.data);
    const formattedMessage = formatToolOutputMessage(
      toolName,
      result,
    );

    const executionResult: ToolExecutionResult = {
      toolName,
      result,
      executionTime: 0,
      correlationId: options.correlationId,
      formattedMessage,
      screenshot: materializedAttachment.screenshot,
      screenshotRef: materializedAttachment.screenshotRef,
      screenshotUrl: materializedAttachment.screenshotUrl,
      screenshotContentType: materializedAttachment.screenshotContentType,
      systemState: finalSystemState,
    };
    // Preserve existing UI-before-backend ordering so transcript and chat rows appear immediately.
    emitToolExecutionResult(callbacks, executionResult);

    logRendererToolScreenshotDebug('before-backend-send', {
      toolName,
      correlationId: options.correlationId,
      includeScreenshot: isComputerTool,
      backendWillSendScreenshotRef: materializedAttachment.screenshotRef,
      backendWillSendInlineScreenshot: materializedAttachment.screenshotRef
        ? null
        : Boolean(materializedAttachment.screenshot),
    });

    sendToolExecutionResultToBackend(callbacks, {
      correlationId: options.correlationId,
      result,
      formattedMessage,
      systemState: finalSystemState,
      includeScreenshot: isComputerTool,
      screenshot: materializedAttachment.screenshotRef ? null : materializedAttachment.screenshot,
      screenshotRef: materializedAttachment.screenshotRef,
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
      formattedMessage: formatToolOutputMessage(toolName, failure),
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
