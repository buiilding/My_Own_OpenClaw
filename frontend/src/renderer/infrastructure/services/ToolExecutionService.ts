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
    const shortId = options.correlationId ? options.correlationId.substring(0, 15) : 'unknown';
    console.log(`[Timing] Tool execution started: ${toolName} (request_id=${shortId})`);

    try {
      // Execute tool via IPC
      const toolInvokeStartTime = performance.now();
      const result: ToolResult = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
        toolName,
        args,
        skipAutoCapture: options.skipAutoCapture || false
      });
      const toolInvokeTime = (performance.now() - toolInvokeStartTime) / 1000;

      // Check if this is a computer-use tool that should have a screenshot
      // run_shell_command is conditionally a computer-use tool if wait parameter is provided
      const isComputerTool = isComputerUseTool(toolName, args);
      
      let screenshot: string | null = null;
      let systemState: SystemState | null = null;
      let waitDelay = 0;
      let captureTime = 0;
      
      // Safely extract screenshot and system_state from result.data
      if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
        screenshot = result.data.screenshot || null;
        systemState = result.data.system_state || null;
      }

      // Capture screenshot and system state ONCE after individual tool execution if needed
      if (isComputerTool && !options.skipAutoCapture && !screenshot) {
        const capture = await captureAfterTool(toolName, args, true, 2);
        waitDelay = capture.waitSeconds;
        captureTime = capture.captureTime;
        systemState = capture.systemState;
        screenshot = capture.screenshot;

        if (screenshot && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
          result.data = {
            ...result.data,
            screenshot: screenshot,
            system_state: systemState ?? undefined
          };
        }
      }

      // Handle screenshot tool when called directly (not as part of auto-capture)
      if (toolName === 'screenshot' && !options.skipAutoCapture && !screenshot) {
        const capture = await captureAfterTool(toolName, args, true, 0);
        waitDelay = capture.waitSeconds;
        captureTime = capture.captureTime;
        systemState = capture.systemState;
        screenshot = capture.screenshot;

        if (screenshot && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
          result.data = {
            ...result.data,
            screenshot: screenshot,
            system_state: systemState ?? undefined
          };
        }
      }

      // Format complete message with system context XML
      const finalSystemState = systemState || 
        (result.data && typeof result.data === 'object' && !Array.isArray(result.data) 
          ? (result.data.system_state as SystemState | undefined) || null 
          : null);
      const formattedMessage = formatToolOutputMessage(
        toolName,
        result,
        finalSystemState
      );

      // Prepare result (executionTime will be calculated after sending to backend)
      const executionResult: ToolExecutionResult = {
        toolName,
        result,
        executionTime: 0, // Will be set after backend send
        correlationId: options.correlationId,
        formattedMessage,
        screenshot,
        systemState
      };

      // Call UI callback
      if (this.callbacks.onToolResult) {
        this.callbacks.onToolResult(executionResult);
      }

      // Send result to backend
      if (this.callbacks.sendToBackend) {
        const payloadData = {
          ...(result.data && typeof result.data === 'object' ? result.data : {}),
          llm_content: formattedMessage,
          is_preformatted: true,
        };

        this.callbacks.sendToBackend({
          type: 'tool-result',
          payload: {
            request_id: options.correlationId,
            success: result.success,
            data: payloadData,
            error: result.error,
          }
        });
      }

      // Calculate total execution time AFTER sending to backend (execution is complete when backend receives result)
      // This includes: tool IPC + wait delay + screenshot capture + formatting + backend send
      const totalExecutionTime = (performance.now() - totalStartTime) / 1000;
      executionResult.executionTime = totalExecutionTime;
      
      // Log detailed timing breakdown
      if (isComputerTool && !options.skipAutoCapture) {
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

      return executionResult;
    } catch (error: any) {
      const errorExecutionTime = (performance.now() - totalStartTime) / 1000;
      console.error(`[ToolExecutionService] Tool execution failed: ${error.message} (took ${errorExecutionTime.toFixed(3)}s)`);

      // Format error message with system context XML
      const errorFormattedMessage = formatToolOutputMessage(
        toolName,
        { success: false, error: error.message, data: null },
        null // No system state for errors
      );

      // Prepare error result
      const errorResult: ToolExecutionResult = {
        toolName,
        result: { success: false, error: error.message, data: null },
        executionTime: errorExecutionTime,
        correlationId: options.correlationId,
        formattedMessage: errorFormattedMessage,
        screenshot: null,
        systemState: null
      };

      // Call UI callback
      if (this.callbacks.onToolResult) {
        this.callbacks.onToolResult(errorResult);
      }

      // Send error result to backend
      if (this.callbacks.sendToBackend) {
        this.callbacks.sendToBackend({
          type: 'tool-result',
          payload: {
            request_id: options.correlationId,
            success: false,
            error: error.message,
            data: {
              llm_content: errorFormattedMessage,
              is_preformatted: true,
            },
          }
        });
      }

      throw error;
    }
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
      if (this.callbacks.sendToBackend) {
        console.log('[ToolExecutionService] Sending atomic tool-bundle-result');

        // Get error message from failed step if any
        const failedStep = stepResults.find(step => step.status === 'error');
        const errorMessage = bundleStatus === 'failure' 
          ? (failedStep?.output || 'Bundle execution failed')
          : null;

        this.callbacks.sendToBackend({
          type: 'tool-bundle-result',
          payload: {
            bundle_id: bundleId,
            status: bundleStatus,
            step_results: stepResults,
            screenshot: screenshot || null,
            system_state: systemState || null,
            error: errorMessage
          }
        });
      }

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
      if (this.callbacks.sendToBackend) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.callbacks.sendToBackend({
          type: 'tool-bundle-result',
          payload: {
            bundle_id: bundleId,
            status: 'failure',
            step_results: stepResults, // Partial results if any
            screenshot: null,
            system_state: null,
            error: errorMessage
          }
        });
      }

      throw error;
    }
  }
}
