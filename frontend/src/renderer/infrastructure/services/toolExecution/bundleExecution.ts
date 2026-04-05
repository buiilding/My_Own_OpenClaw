import { formatBundledToolOutputMessage } from '../MessageFormatter';
import { materializeScreenshotAttachment } from '../ScreenshotAttachmentPipeline';
import { isComputerUseTool } from './ToolExecutionCapture';
import { runToolBundle, type BundleStepResult } from './ToolExecutionBundleRunner';
import {
  buildBundledToolResults,
  resolveBundleErrorMessage,
  resolveBundleStatus,
} from './BundleExecutionModel';
import {
  logBundleDispatch,
  logBundleFailure,
  logBundleFormatting,
  logBundleStart,
  logBundleTiming,
} from './ToolExecutionLogger';
import {
  emitToolExecutionBundleResult,
  sendToolExecutionBundleResultToBackend,
} from './ToolExecutionResultDispatch';
import type { ToolExecutionCallbacks, BundleExecutionResult } from './ToolExecutionTypes';

export async function executeToolBundleRuntime(
  callbacks: ToolExecutionCallbacks,
  bundle: Array<{ toolName: string; args: any }>,
  bundleId: string,
): Promise<BundleExecutionResult> {
  const bundleStartTime = performance.now();
  const bundleHasComputerTool = bundle.some((tool) => isComputerUseTool(tool.toolName, tool.args));
  let stepResults: BundleStepResult[] = [];
  logBundleStart(bundle.length, bundleId);

  try {
    const {
      stepResults: collectedStepResults,
      systemState,
      screenshot,
      screenshotRef,
      screenshotUrl,
      screenshotContentType,
      captureMeta,
      totalWaitDelay,
      totalCaptureTime,
      toolExecutionTimes,
    } = await runToolBundle(bundle, bundleId);
    stepResults = collectedStepResults;

    const bundleStatus = resolveBundleStatus(stepResults, bundle.length);
    const bundledResults = buildBundledToolResults(stepResults);

    const formattingStartTime = performance.now();
    const combinedFormattedMessage = formatBundledToolOutputMessage(
      bundledResults,
      screenshot,
    );
    const formattingTime = (performance.now() - formattingStartTime) / 1000;
    logBundleFormatting(formattingTime);

    const materializedAttachment = await materializeScreenshotAttachment(
      {
        screenshot,
        screenshotRef,
        screenshotUrl,
        screenshotContentType,
        captureMeta,
      },
      { filenameStem: `bundle-${bundleId}` },
    );

    const bundleResult: BundleExecutionResult = {
      correlationId: bundleId,
      results: bundledResults,
      totalTime: 0,
      formattedMessage: combinedFormattedMessage,
      screenshot: materializedAttachment.screenshot,
      screenshotRef: materializedAttachment.screenshotRef,
      screenshotUrl: materializedAttachment.screenshotUrl,
      screenshotContentType: materializedAttachment.screenshotContentType,
      systemState,
    };

    emitToolExecutionBundleResult(callbacks, bundleResult);
    logBundleDispatch();

    sendToolExecutionBundleResultToBackend(callbacks, {
      bundleId,
      status: bundleStatus,
      stepResults,
      screenshot: materializedAttachment.screenshotRef ? null : materializedAttachment.screenshot,
      screenshotRef: materializedAttachment.screenshotRef,
      captureMeta,
      systemState,
      error: resolveBundleErrorMessage(bundleStatus, stepResults),
      includeScreenshot: bundleHasComputerTool,
      includeSystemState: bundleHasComputerTool,
    });

    const bundleExecutionTime = (performance.now() - bundleStartTime) / 1000;
    bundleResult.totalTime = bundleExecutionTime;
    const totalToolTime = toolExecutionTimes.reduce((sum, t) => sum + t.time, 0);
    logBundleTiming({
      stepCount: stepResults.length,
      bundleExecutionTime,
      totalToolTime,
      totalWaitDelay,
      totalCaptureTime,
      bundleId,
      captured: systemState !== null || screenshot !== null,
    });

    return bundleResult;
  } catch (error: unknown) {
    const bundleTotalTime = (performance.now() - bundleStartTime) / 1000;
    logBundleFailure(bundleId, bundleTotalTime, error);

    sendToolExecutionBundleResultToBackend(callbacks, {
      bundleId,
      status: 'failure',
      stepResults,
      screenshot: null,
      screenshotRef: null,
      captureMeta: null,
      systemState: null,
      error: error instanceof Error ? error.message : String(error),
      includeScreenshot: bundleHasComputerTool,
      includeSystemState: bundleHasComputerTool,
    });
    throw error;
  }
}
