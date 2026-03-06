import { formatBundledToolOutputMessage } from '../MessageFormatter';
import { uploadArtifactBase64 } from '../ArtifactUploader';
import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from '../ArtifactImageUtils';
import { isComputerUseTool } from './ToolExecutionCapture';
import { runToolBundle, type BundleStepResult } from './ToolExecutionBundleRunner';
import {
  normalizeBundleStepResults,
  resolveBundleErrorMessage,
  resolveBundleStatus,
  toBundleExecutionResults,
} from './ToolExecutionPayloads';
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
      screenshotContentType,
      captureMeta,
      totalWaitDelay,
      totalCaptureTime,
      toolExecutionTimes,
    } = await runToolBundle(bundle, bundleId);
    stepResults = collectedStepResults;

    const bundleStatus = resolveBundleStatus(stepResults, bundle.length);
    const normalizedResults = normalizeBundleStepResults(stepResults);

    const formattingStartTime = performance.now();
    const combinedFormattedMessage = formatBundledToolOutputMessage(
      normalizedResults,
      systemState,
      screenshot,
      bundleHasComputerTool,
    );
    const formattingTime = (performance.now() - formattingStartTime) / 1000;
    logBundleFormatting(formattingTime);

    const bundledUpload = screenshot
      ? await uploadArtifactBase64(
          screenshot,
          normalizeArtifactImageContentType(screenshotContentType),
          `bundle-${bundleId}.${resolveArtifactImageExtension(screenshotContentType)}`,
        )
      : null;
    const bundleScreenshotRef = bundledUpload?.artifactId || null;
    const bundleScreenshotUrl = bundledUpload?.url || null;

    const bundleResult: BundleExecutionResult = {
      correlationId: bundleId,
      results: toBundleExecutionResults(normalizedResults),
      totalTime: 0,
      formattedMessage: combinedFormattedMessage,
      screenshot,
      screenshotRef: bundleScreenshotRef,
      screenshotUrl: bundleScreenshotUrl,
      screenshotContentType: bundledUpload?.contentType || null,
      systemState,
    };

    emitToolExecutionBundleResult(callbacks, bundleResult);
    logBundleDispatch();

    sendToolExecutionBundleResultToBackend(callbacks, {
      bundleId,
      status: bundleStatus,
      stepResults,
      screenshotRef: bundleScreenshotRef,
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
