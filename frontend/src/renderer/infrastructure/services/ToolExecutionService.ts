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
  type BundledToolResult
} from './MessageFormatter';

/**
 * Computer-use tools that require screenshots
 */
const COMPUTER_USE_TOOLS = ['mouse_control', 'keyboard_control', 'scroll_control', 'screenshot', 'wait', 'switch_tab'];

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  skipAutoCapture?: boolean;
  correlationId: string;
}

/**
 * Tool bundle item
 */
export interface ToolBundleItem {
  toolName: string;
  args: any;
  correlationId: string;
}

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult {
  toolName: string;
  result: ToolResult;
  executionTime: number;
  correlationId: string;
  formattedMessage: string;
  screenshot?: string | null;
  systemState?: SystemState | null;
}

/**
 * Bundle execution result
 */
export interface BundleExecutionResult {
  correlationId: string;
  results: BundledToolResult[];
  totalTime: number;
  formattedMessage: string;
  screenshot?: string | null;
  systemState?: SystemState | null;
}

/**
 * Callbacks for UI updates and backend communication
 */
export interface ToolExecutionCallbacks {
  /**
   * Called when a tool result should be displayed in UI
   */
  onToolResult?: (result: ToolExecutionResult) => void;
  
  /**
   * Called when a bundle result should be displayed in UI
   */
  onBundleResult?: (result: BundleExecutionResult) => void;
  
  /**
   * Called to send tool result to backend
   */
  sendToBackend?: (payload: any) => void;
}

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
   * Capture system state and screenshot after tool execution.
   * This is called ONCE after individual tool execution or ONCE after all bundled tools.
   * 
   * @param context - Context string for logging (e.g., "after keyboard_control" or "after bundle")
   * @param waitSeconds - Optional delay in milliseconds before capturing (defaults to 2000ms)
   * @returns Object with systemState and screenshot, or null if capture failed
   */
  private async captureSystemStateAndScreenshot(context: string, waitSeconds: number = 2000): Promise<{ systemState: SystemState | null; screenshot: string | null }> {
    // Wait for specified delay (default 2 seconds) for UI to update before capturing
    await new Promise(r => setTimeout(r, waitSeconds));

    try {
      const captureStartTime = performance.now();
      
      // Get system state and screenshot in parallel
      const [stateResult, screenshotResult] = await Promise.all([
        IpcBridge.invoke<SystemState>(INVOKE_CHANNELS.GET_SYSTEM_STATE),
        IpcBridge.invoke<ToolResult>(INVOKE_CHANNELS.EXECUTE_TOOL, {
          toolName: 'screenshot',
          args: {
            explanation: `Screenshot ${context}`,
            expectation: `State ${context}`
          },
          skipAutoCapture: false
        })
      ]);

      const systemState = stateResult;
      const screenshot = screenshotResult.success && screenshotResult.data && typeof screenshotResult.data === 'object'
        ? screenshotResult.data.screenshot || null
        : null;

      return { systemState, screenshot };
    } catch (err) {
      console.error(`[ToolExecutionService] Failed to capture system state/screenshot ${context}:`, err);
      return { systemState: null, screenshot: null };
    }
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
      const isStandardComputerUseTool = COMPUTER_USE_TOOLS.includes(toolName);
      const isRunShellCommandWithWait = toolName === 'run_shell_command' && 
        args && typeof args === 'object' && typeof args.wait === 'number' && args.wait > 0;
      const isComputerUseTool = isStandardComputerUseTool || isRunShellCommandWithWait;
      
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
      if (isComputerUseTool && !options.skipAutoCapture && !screenshot) {
        // Extract wait parameter from tool args (convert seconds to milliseconds)
        // For wait tool, use the 'seconds' parameter; for other tools, use 'wait' parameter
        // Default to 2000ms (2 seconds) if not provided
        let waitSeconds = 2000;
        if (toolName === 'wait' && args && typeof args === 'object' && typeof args.seconds === 'number') {
          // Wait tool: use 'seconds' parameter
          waitSeconds = args.seconds * 1000;
        } else if (args && typeof args === 'object' && typeof args.wait === 'number') {
          // Other computer-use tools: use 'wait' parameter
          waitSeconds = args.wait * 1000;
        }
        
        waitDelay = waitSeconds / 1000; // Convert back to seconds for logging
        const captureStartTime = performance.now();
        const captureResult = await this.captureSystemStateAndScreenshot(`after ${toolName}`, waitSeconds);
        captureTime = (performance.now() - captureStartTime) / 1000;
        systemState = captureResult.systemState;
        screenshot = captureResult.screenshot;

        // Add screenshot to result data
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
      if (isComputerUseTool && !options.skipAutoCapture) {
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
      const toolExecutionTimes: Array<{ tool: string; time: number }> = [];
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

      // Check if any tool in bundle is a computer-use tool
      // run_shell_command is conditionally a computer-use tool if wait parameter is provided
      const hasComputerUseTool = bundle.some(tool => {
        const isStandardComputerUseTool = COMPUTER_USE_TOOLS.includes(tool.toolName);
        const isRunShellCommandWithWait = tool.toolName === 'run_shell_command' && 
          tool.args && typeof tool.args === 'object' && typeof tool.args.wait === 'number' && tool.args.wait > 0;
        return isStandardComputerUseTool || isRunShellCommandWithWait;
      });

      // Get system state and screenshot ONCE after all bundled tools execute
      let systemState: SystemState | null = null;
      let screenshot: string | null = null;
      let waitDelay = 0;
      let captureTime = 0;

      if (hasComputerUseTool) {
        // Extract wait parameter from all computer-use tools in bundle and accumulate
        // Default to 2000ms (2 seconds) if not provided
        let waitSeconds = 2000;
        // Get all computer-use tools (standard + run_shell_command with wait)
        const computerUseTools = bundle.filter(tool => {
          const isStandardComputerUseTool = COMPUTER_USE_TOOLS.includes(tool.toolName);
          const isRunShellCommandWithWait = tool.toolName === 'run_shell_command' && 
            tool.args && typeof tool.args === 'object' && typeof tool.args.wait === 'number' && tool.args.wait > 0;
          return isStandardComputerUseTool || isRunShellCommandWithWait;
        });
        
        if (computerUseTools.length > 0) {
          // Extract wait values from all computer-use tools
          // For wait tool, use 'seconds' parameter; for other tools, use 'wait' parameter
          const waitValues = computerUseTools
            .map(tool => {
              if (!tool.args || typeof tool.args !== 'object') return null;
              if (tool.toolName === 'wait' && typeof tool.args.seconds === 'number') {
                return tool.args.seconds;
              } else if (typeof tool.args.wait === 'number') {
                return tool.args.wait;
              }
              return null;
            })
            .filter((w): w is number => w !== null);
          
          if (waitValues.length > 0) {
            // Accumulate wait values from all computer-use tools in the bundle
            const totalWaitSeconds = waitValues.reduce((sum, wait) => sum + wait, 0);
            waitSeconds = totalWaitSeconds * 1000;
            waitDelay = totalWaitSeconds; // Store in seconds for logging
          }
        }
        
        const captureStartTime = performance.now();
        const captureResult = await this.captureSystemStateAndScreenshot('after bundle execution', waitSeconds);
        captureTime = (performance.now() - captureStartTime) / 1000;
        systemState = captureResult.systemState;
        screenshot = captureResult.screenshot;
      } else {
        console.log('[ToolExecutionService] Skipping system state/screenshot (no computer-use tools in bundle)');
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
      if (hasComputerUseTool) {
        console.log(
          `[Timing] Bundle execution completed: ${stepResults.length} steps took ${bundleExecutionTime.toFixed(3)}s total ` +
          `(tools: ${totalToolTime.toFixed(3)}s, wait: ${waitDelay.toFixed(3)}s, capture: ${captureTime.toFixed(3)}s) ` +
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
