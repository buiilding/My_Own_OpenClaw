/**
 * Tool Execution Service.
 * Handles tool execution and bundling logic.
 * Pure infrastructure code - no React dependencies.
 * Accepts callbacks for UI updates and backend communication.
 */

import { IpcBridge, INVOKE_CHANNELS, SEND_CHANNELS } from '../ipc/bridge';
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
  captureAfterTool,
  isComputerUseTool,
} from './ToolExecutionCapture';

export {
  ToolExecutionOptions,
  ToolExecutionResult,
  BundleExecutionResult,
  ToolExecutionCallbacks,
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
    const shortId = this._shortCorrelationId(options.correlationId);
    console.log(`[Timing] Tool execution started: ${toolName} (request_id=${shortId})`);

    try {
      const { result, toolInvokeTime } = await this._invokeTool(toolName, args, options);
      const capture = await this._ensureCapture(toolName, args, options, result);
      const { screenshot, systemState, waitDelay, captureTime, isComputerTool } = capture;

      // Format complete message with system context XML
      const finalSystemState = this._resolveSystemState(systemState, result.data);
      const formattedMessage = formatToolOutputMessage(
        toolName,
        result,
        finalSystemState
      );

      const executionResult = this._buildExecutionResult(
        toolName,
        result,
        options.correlationId,
        formattedMessage,
        screenshot,
        systemState
      );
      this._emitToolResult(executionResult);

      // Send result to backend
      this._sendToolResult(options.correlationId, result, formattedMessage);

      // Calculate total execution time AFTER sending to backend (execution is complete when backend receives result)
      // This includes: tool IPC + wait delay + screenshot capture + formatting + backend send
      const totalExecutionTime = (performance.now() - totalStartTime) / 1000;
      executionResult.executionTime = totalExecutionTime;
      
      // Log detailed timing breakdown
      this._logToolTiming(
        toolName,
        totalExecutionTime,
        toolInvokeTime,
        waitDelay,
        captureTime,
        shortId,
        isComputerTool,
        options.skipAutoCapture
      );

      return executionResult;
    } catch (error: any) {
      const errorResult = this._handleToolError(
        toolName,
        options.correlationId,
        totalStartTime,
        error
      );
      this._sendToolResult(options.correlationId, errorResult.result, errorResult.formattedMessage);
      throw error;
    }
  }

  private async _invokeTool(
    toolName: string,
    args: any,
    options: ToolExecutionOptions
  ): Promise<{ result: ToolResult; toolInvokeTime: number }> {
    const toolInvokeStartTime = performance.now();
    const result: ToolResult = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName,
      args,
      skipAutoCapture: options.skipAutoCapture || false
    });
    const toolInvokeTime = (performance.now() - toolInvokeStartTime) / 1000;
    return { result, toolInvokeTime };
  }

  private _extractCapture(result: ToolResult): {
    screenshot: string | null;
    systemState: SystemState | null;
  } {
    if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
      return {
        screenshot: result.data.screenshot || null,
        systemState: result.data.system_state || null
      };
    }
    return { screenshot: null, systemState: null };
  }

  private _applyCaptureToResult(
    result: ToolResult,
    screenshot: string | null,
    systemState: SystemState | null
  ): void {
    if (!screenshot) {
      return;
    }
    if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
      result.data = {
        ...result.data,
        screenshot,
        system_state: systemState ?? undefined
      };
    }
  }

  private async _ensureCapture(
    toolName: string,
    args: any,
    options: ToolExecutionOptions,
    result: ToolResult
  ): Promise<{
    screenshot: string | null;
    systemState: SystemState | null;
    waitDelay: number;
    captureTime: number;
    isComputerTool: boolean;
  }> {
    const isComputerTool = isComputerUseTool(toolName, args);
    let { screenshot, systemState } = this._extractCapture(result);
    let waitDelay = 0;
    let captureTime = 0;

    if (isComputerTool && !options.skipAutoCapture && !screenshot) {
      const capture = await captureAfterTool(toolName, args, true, 2);
      waitDelay = capture.waitSeconds;
      captureTime = capture.captureTime;
      systemState = capture.systemState;
      screenshot = capture.screenshot;
      this._applyCaptureToResult(result, screenshot, systemState);
    }

    if (toolName === 'screenshot' && !options.skipAutoCapture && !screenshot) {
      const capture = await captureAfterTool(toolName, args, true, 0);
      waitDelay = capture.waitSeconds;
      captureTime = capture.captureTime;
      systemState = capture.systemState;
      screenshot = capture.screenshot;
      this._applyCaptureToResult(result, screenshot, systemState);
    }

    return {
      screenshot,
      systemState,
      waitDelay,
      captureTime,
      isComputerTool
    };
  }

  private _buildExecutionResult(
    toolName: string,
    result: ToolResult,
    correlationId: string,
    formattedMessage: string,
    screenshot: string | null,
    systemState: SystemState | null
  ): ToolExecutionResult {
    return {
      toolName,
      result,
      executionTime: 0,
      correlationId,
      formattedMessage,
      screenshot,
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

  private _logToolTiming(
    toolName: string,
    totalExecutionTime: number,
    toolInvokeTime: number,
    waitDelay: number,
    captureTime: number,
    shortId: string,
    isComputerTool: boolean,
    skipAutoCapture?: boolean
  ): void {
    if (isComputerTool && !skipAutoCapture) {
      console.log(
        `[Timing] Tool execution completed: ${toolName} took ${totalExecutionTime.toFixed(3)}s total ` +
        `(IPC: ${toolInvokeTime.toFixed(3)}s, wait: ${waitDelay.toFixed(3)}s, capture: ${captureTime.toFixed(3)}s) ` +
        `(request_id=${shortId})`
      );
    } else {
      console.log(
        `[Timing] Tool execution completed: ${toolName} took ${totalExecutionTime.toFixed(3)}s ` +
        `(IPC: ${toolInvokeTime.toFixed(3)}s) (request_id=${shortId})`
      );
    }
  }

  private _shortCorrelationId(correlationId?: string): string {
    return correlationId ? correlationId.substring(0, 15) : 'unknown';
  }

  private _resolveSystemState(
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

  private _sendToolResult(
    correlationId: string | undefined,
    result: ToolResult,
    formattedMessage: string
  ): void {
    if (!this.callbacks.sendToBackend) {
      return;
    }

    const payloadData = {
      ...(result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : {}),
      llm_content: formattedMessage,
      is_preformatted: true,
    };

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
    screenshot: string | null,
    systemState: SystemState | null,
    error: string | null
  ): void {
    if (!this.callbacks.sendToBackend) {
      return;
    }

    this.callbacks.sendToBackend({
      type: 'tool-bundle-result',
      payload: {
        bundle_id: bundleId,
        status,
        step_results: stepResults,
        screenshot: screenshot || null,
        system_state: systemState || null,
        error
      }
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
    const stepResults: Array<{ tool: string; status: string; output: string }> = [];
    console.log(`[Timing] Bundle execution started: ${bundle.length} tools (bundle_id=${bundleId})`);
    console.log('[ToolExecutionService] Executing atomic bundle of size:', bundle.length);
    console.log('[ToolExecutionService] Bundle ID:', bundleId);

    try {
      // Execute all tools sequentially with skipAutoCapture (FAIL-FAST: stop on first error)
      // After each tool, capture OS state if it's a computer-use tool
      const toolExecutionTimes: Array<{ tool: string; time: number }> = [];
      let systemState: SystemState | null = null;
      let screenshot: string | null = null;
      let totalWaitDelay = 0;
      let totalCaptureTime = 0;

      for (let i = 0; i < bundle.length; i++) {
        const tool = bundle[i];
        const toolStartTime = performance.now();

        try {
          console.log(`[ToolExecutionService] Executing bundled tool ${i+1}/${bundle.length}: ${tool.toolName}`);

          // Execute tool with skipAutoCapture (no system state, no screenshot)
          const result: ToolResult = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
            toolName: tool.toolName,
            args: tool.args,
            skipAutoCapture: true
          });

          const toolExecutionTime = (performance.now() - toolStartTime) / 1000;
          toolExecutionTimes.push({ tool: tool.toolName, time: toolExecutionTime });
          console.log(`[Timing] Bundled tool IPC: ${tool.toolName} took ${toolExecutionTime.toFixed(3)}s`);

          // Extract output for step result
          const output = result.data && typeof result.data === 'object' && result.data.output
            ? String(result.data.output)
            : result.success
            ? `Tool ${tool.toolName} executed successfully`
            : result.error || 'Unknown error';

          stepResults.push({
            tool: tool.toolName,
            status: result.success ? 'ok' : 'error',
            output: output
          });

          // FAIL-FAST: If tool failed, stop execution immediately
          if (!result.success) {
            console.error(`[ToolExecutionService] Tool ${tool.toolName} failed, stopping bundle execution (fail-fast)`);
            break;
          }

          // Check if this tool is a computer-use tool that needs screenshot/system state
          const isComputerTool = isComputerUseTool(tool.toolName, tool.args);

          // Extract OS state after each tool if it's a computer-use tool
          // Only get system state on the last tool; all others get screenshot only
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
            if (isLastTool) {
              systemState = capture.systemState;
            }
          }
        } catch (err: any) {
          const toolExecutionTime = (performance.now() - toolStartTime) / 1000;
          toolExecutionTimes.push({ tool: tool.toolName, time: toolExecutionTime });
          console.error(`[ToolExecutionService] Bundle tool execution failed: ${tool.toolName} (took ${toolExecutionTime.toFixed(3)}s):`, err);

          stepResults.push({
            tool: tool.toolName,
            status: 'error',
            output: err.message || 'Unknown error'
          });

          // FAIL-FAST: Stop execution on exception
          break;
        }
      }

      // Determine bundle status
      const allSuccess = stepResults.every(step => step.status === 'ok');
      const hasFailures = stepResults.some(step => step.status === 'error');
      const bundleStatus = allSuccess ? 'success' : (hasFailures && stepResults.length < bundle.length) ? 'partial_failure' : 'failure';

      // Format combined bundled message for UI display
      const formattingStartTime = performance.now();
      const combinedFormattedMessage = formatBundledToolOutputMessage(
        stepResults.map(step => ({
          tool_name: step.tool,
          _rawResult: { success: step.status === 'ok', error: step.status === 'error' ? step.output : null, data: null },
          success: step.status === 'ok',
          error: step.status === 'error' ? step.output : null,
          data: null
        })),
        systemState,
        screenshot
      );
      const formattingTime = (performance.now() - formattingStartTime) / 1000;
      console.log(`[Timing] Message formatting took ${formattingTime.toFixed(3)}s`);

      // Prepare bundle result for UI callback (totalTime will be set after backend send)
      const bundleResult: BundleExecutionResult = {
        correlationId: bundleId,
        results: stepResults.map(step => ({
          tool_name: step.tool,
          request_id: '', // Not needed for atomic bundles
          success: step.status === 'ok',
          data: null,
          error: step.status === 'error' ? step.output : null,
          executionTime: 0,
          _rawResult: { success: step.status === 'ok', error: step.status === 'error' ? step.output : null, data: null }
        })),
        totalTime: 0, // Will be set after backend send
        formattedMessage: combinedFormattedMessage,
        screenshot,
        systemState
      };

      // Call UI callback
      if (this.callbacks.onBundleResult) {
        this.callbacks.onBundleResult(bundleResult);
      }

      // Send atomic tool-bundle-result to backend
      console.log('[ToolExecutionService] Sending atomic tool-bundle-result');

      // Get error message from failed step if any
      const failedStep = stepResults.find(step => step.status === 'error');
      const errorMessage = bundleStatus === 'failure' 
        ? (failedStep?.output || 'Bundle execution failed')
        : null;

      this._sendBundleResult(
        bundleId,
        bundleStatus,
        stepResults,
        screenshot,
        systemState,
        errorMessage
      );

      // Calculate bundle execution time AFTER sending to backend (execution is complete when backend receives result)
      // This includes: all tool IPC calls + wait delay + screenshot capture + formatting + backend send
      const bundleExecutionTime = (performance.now() - bundleStartTime) / 1000;
      bundleResult.totalTime = bundleExecutionTime;
      
      // Log detailed timing breakdown
      const totalToolTime = toolExecutionTimes.reduce((sum, t) => sum + t.time, 0);
      if (systemState !== null || screenshot !== null) {
        console.log(
          `[Timing] Bundle execution completed: ${stepResults.length} steps took ${bundleExecutionTime.toFixed(3)}s total ` +
          `(tools: ${totalToolTime.toFixed(3)}s, wait: ${totalWaitDelay.toFixed(3)}s, capture: ${totalCaptureTime.toFixed(3)}s) ` +
          `(bundle_id=${bundleId})`
        );
      } else {
        console.log(
          `[Timing] Bundle execution completed: ${stepResults.length} steps took ${bundleExecutionTime.toFixed(3)}s ` +
          `(tools: ${totalToolTime.toFixed(3)}s) (bundle_id=${bundleId})`
        );
      }

      return bundleResult;
    } catch (error: any) {
      const bundleTotalTime = (performance.now() - bundleStartTime) / 1000;
      console.error(`[Timing] Bundle execution failed after ${bundleTotalTime.toFixed(3)}s:`, error);
      console.error('[ToolExecutionService] Bundle execution failed:', error);

      // Send error bundle result to backend
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._sendBundleResult(
        bundleId,
        'failure',
        stepResults,
        null,
        null,
        errorMessage
      );

      throw error;
    }
  }
}
