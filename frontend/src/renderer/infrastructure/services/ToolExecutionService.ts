/**
 * Tool Execution Service.
 * Handles tool execution and bundling logic.
 * Pure infrastructure code - no React dependencies.
 * Accepts callbacks for UI updates and backend communication.
 */

import {
  formatToolOutputMessage,
  formatBundledToolOutputMessage,
  type ToolResult,
  type SystemState,
} from './MessageFormatter';
import {
  type ToolExecutionOptions,
  type ToolExecutionResult,
  type BundleExecutionResult,
  type ToolExecutionCallbacks,
} from './ToolExecutionTypes';
import {
  ensureAutoCapture,
  isComputerUseTool,
  resolveSystemState,
} from './ToolExecutionCapture';
import { invokeTool } from './ToolExecutionInvoker';
import {
  buildToolResultPayloadData,
  normalizeBundleStepResults,
  resolveBundleErrorMessage,
  resolveBundleStatus,
  toBundleExecutionResults,
} from './ToolExecutionPayloads';
import { uploadArtifactBase64 } from './ArtifactUploader';
import {
  normalizeArtifactImageContentType,
  resolveArtifactImageExtension,
} from './ArtifactImageUtils';
import {
  logToolStart,
  logToolTiming,
  logBundleStart,
  logBundleFormatting,
  logBundleDispatch,
  logBundleTiming,
  logBundleFailure,
} from './ToolExecutionLogger';
import { runToolBundle } from './ToolExecutionBundleRunner';

export {
  ToolExecutionResult,
  BundleExecutionResult,
};

/**
 * Tool Execution Service
 */
export class ToolExecutionService {
  private callbacks: ToolExecutionCallbacks;

  constructor(callbacks: ToolExecutionCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Update callbacks (useful for React hooks)
   */
  setCallbacks(callbacks: ToolExecutionCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Execute a single tool
   */
  async executeTool(
    toolName: string,
    args: any,
    options: ToolExecutionOptions
  ): Promise<ToolExecutionResult> {
    const totalStartTime = performance.now();
    const shortId = logToolStart(toolName, options.correlationId);

    try {
      const { result, toolInvokeTime } = await invokeTool(
        toolName,
        args,
        options.skipAutoCapture || false
      );
      const capture = await ensureAutoCapture(
        toolName,
        args,
        options.skipAutoCapture,
        result
      );
      const { screenshot, screenshotContentType, systemState, waitDelay, captureTime, isComputerTool } = capture;

      const uploaded = isComputerTool && screenshot
        ? await uploadArtifactBase64(
            screenshot,
            normalizeArtifactImageContentType(screenshotContentType),
            `${toolName}-screenshot.${resolveArtifactImageExtension(screenshotContentType)}`
          )
        : null;
      const screenshotRef = uploaded?.artifactId || null;
      const screenshotUrl = uploaded?.url || null;

      // Format complete message with system context XML
      const finalSystemState = resolveSystemState(systemState, result.data);
      const formattedMessage = formatToolOutputMessage(
        toolName,
        result,
        finalSystemState,
        isComputerTool,
      );

      const executionResult = this._buildExecutionResult(
        toolName,
        result,
        options.correlationId,
        formattedMessage,
        screenshot,
        screenshotRef,
        screenshotUrl,
        screenshotContentType,
        finalSystemState
      );
      this._emitToolResult(executionResult);

      // Send result to backend
      this._sendToolResult(
        options.correlationId,
        result,
        formattedMessage,
        finalSystemState,
        isComputerTool,
        screenshotRef,
        isComputerTool,
      );

      // Calculate total execution time AFTER sending to backend (execution is complete when backend receives result)
      // This includes: tool IPC + wait delay + screenshot capture + formatting + backend send
      const totalExecutionTime = (performance.now() - totalStartTime) / 1000;
      executionResult.executionTime = totalExecutionTime;
      
      // Log detailed timing breakdown
      logToolTiming({
        toolName,
        totalExecutionTime,
        toolInvokeTime,
        waitDelay,
        captureTime,
        shortId,
        isComputerTool,
        skipAutoCapture: options.skipAutoCapture
      });

      return executionResult;
    } catch (error: any) {
      const errorResult = this._handleToolError(
        toolName,
        options.correlationId,
        totalStartTime,
        error
      );
      this._sendToolResult(
        options.correlationId,
        errorResult.result,
        errorResult.formattedMessage,
        null,
        false,
        null,
        false,
      );
      throw error;
    }
  }


  private _buildExecutionResult(
    toolName: string,
    result: ToolResult,
    correlationId: string,
    formattedMessage: string,
    screenshot: string | null,
    screenshotRef: string | null,
    screenshotUrl: string | null,
    screenshotContentType: string | null,
    systemState: SystemState | null
  ): ToolExecutionResult {
    return {
      toolName,
      result,
      executionTime: 0,
      correlationId,
      formattedMessage,
      screenshot,
      screenshotRef,
      screenshotUrl,
      screenshotContentType,
      systemState
    };
  }

  private _emitToolResult(result: ToolExecutionResult): void {
    if (this.callbacks.onToolResult) {
      this.callbacks.onToolResult(result);
    }
  }

  private _handleToolError(
    toolName: string,
    correlationId: string,
    totalStartTime: number,
    error: any
  ): ToolExecutionResult {
    const errorExecutionTime = (performance.now() - totalStartTime) / 1000;
    console.error(
      `[ToolExecutionService] Tool execution failed: ${error.message} (took ${errorExecutionTime.toFixed(3)}s)`
    );

    const errorFormattedMessage = formatToolOutputMessage(
      toolName,
      { success: false, error: error.message, data: null },
      null
    );

    const errorResult: ToolExecutionResult = {
      toolName,
      result: { success: false, error: error.message, data: null },
      executionTime: errorExecutionTime,
      correlationId,
      formattedMessage: errorFormattedMessage,
      screenshot: null,
      systemState: null
    };

    this._emitToolResult(errorResult);
    return errorResult;
  }


  private _sendToolResult(
    correlationId: string | undefined,
    result: ToolResult,
    formattedMessage: string,
    systemState: SystemState | null,
    includeScreenshot: boolean,
    screenshotRef?: string | null,
    includeSystemState: boolean = false,
  ): void {
    if (!this.callbacks.sendToBackend) {
      return;
    }

    const payloadData = buildToolResultPayloadData(result, formattedMessage, {
      screenshotRef,
      systemState,
      includeScreenshot,
      includeSystemState,
    });

    this.callbacks.sendToBackend({
      type: 'tool-result',
      payload: {
        request_id: correlationId,
        success: result.success,
        data: payloadData,
        error: result.error,
      }
    });
  }

  private _sendBundleResult(
    bundleId: string,
    status: string,
    stepResults: Array<{ tool: string; status: string; output: string }>,
    screenshotRef: string | null,
    systemState: SystemState | null,
    error: string | null,
    includeScreenshot: boolean,
    includeSystemState: boolean,
  ): void {
    if (!this.callbacks.sendToBackend) {
      return;
    }

    const payload: Record<string, unknown> = {
      bundle_id: bundleId,
      status,
      step_results: stepResults,
      error,
    };

    if (includeScreenshot && screenshotRef) {
      payload.screenshot_ref = screenshotRef;
    }

    if (includeSystemState && systemState) {
      payload.system_state = systemState;
    }

    this.callbacks.sendToBackend({
      type: 'tool-bundle-result',
      payload
    });
  }

  /**
   * Execute a bundle of tools sequentially (atomic bundle).
   * 
   * Accepts tools array directly and sends single tool-bundle-result message.
   */
  async executeToolBundle(
    bundle: Array<{ toolName: string; args: any }>,
    bundleId: string
  ): Promise<BundleExecutionResult> {
    const bundleStartTime = performance.now();
    const bundleHasComputerTool = bundle.some((tool) =>
      isComputerUseTool(tool.toolName, tool.args),
    );
    let stepResults: Array<{ tool: string; status: string; output: string }> = [];
    logBundleStart(bundle.length, bundleId);

    try {
      const {
        stepResults: collectedStepResults,
        systemState,
        screenshot,
        screenshotContentType,
        totalWaitDelay,
        totalCaptureTime,
        toolExecutionTimes
      } = await runToolBundle(bundle);
      stepResults = collectedStepResults;

      // Determine bundle status
      const bundleStatus = resolveBundleStatus(stepResults, bundle.length);
      const normalizedResults = normalizeBundleStepResults(stepResults);

      // Format combined bundled message for UI display
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
            `bundle-${bundleId}.${resolveArtifactImageExtension(screenshotContentType)}`
          )
        : null;
      const bundleScreenshotRef = bundledUpload?.artifactId || null;
      const bundleScreenshotUrl = bundledUpload?.url || null;

      // Prepare bundle result for UI callback (totalTime will be set after backend send)
      const bundleResult: BundleExecutionResult = {
        correlationId: bundleId,
        results: toBundleExecutionResults(normalizedResults),
        totalTime: 0, // Will be set after backend send
        formattedMessage: combinedFormattedMessage,
        screenshot,
        screenshotRef: bundleScreenshotRef,
        screenshotUrl: bundleScreenshotUrl,
        screenshotContentType: bundledUpload?.contentType || null,
        systemState
      };

      // Call UI callback
      if (this.callbacks.onBundleResult) {
        this.callbacks.onBundleResult(bundleResult);
      }

      // Send atomic tool-bundle-result to backend
      logBundleDispatch();

      // Get error message from failed step if any
      const errorMessage = resolveBundleErrorMessage(bundleStatus, stepResults);

      this._sendBundleResult(
        bundleId,
        bundleStatus,
        stepResults,
        bundleScreenshotRef,
        systemState,
        errorMessage,
        bundleHasComputerTool,
        bundleHasComputerTool,
      );

      // Calculate bundle execution time AFTER sending to backend (execution is complete when backend receives result)
      // This includes: all tool IPC calls + wait delay + screenshot capture + formatting + backend send
      const bundleExecutionTime = (performance.now() - bundleStartTime) / 1000;
      bundleResult.totalTime = bundleExecutionTime;
      
      // Log detailed timing breakdown
      const totalToolTime = toolExecutionTimes.reduce((sum, t) => sum + t.time, 0);
      logBundleTiming({
        stepCount: stepResults.length,
        bundleExecutionTime,
        totalToolTime,
        totalWaitDelay,
        totalCaptureTime,
        bundleId,
        captured: systemState !== null || screenshot !== null
      });

      return bundleResult;
    } catch (error: any) {
      const bundleTotalTime = (performance.now() - bundleStartTime) / 1000;
      logBundleFailure(bundleId, bundleTotalTime, error);

      // Send error bundle result to backend
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._sendBundleResult(
        bundleId,
        'failure',
        stepResults,
        null,
        null,
        errorMessage,
        bundleHasComputerTool,
        bundleHasComputerTool,
      );

      throw error;
    }
  }
}
