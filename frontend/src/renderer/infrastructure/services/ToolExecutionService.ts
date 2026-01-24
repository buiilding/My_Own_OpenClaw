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
    console.log(`[ToolExecutionService] Capturing system state and screenshot ${context}...`);
    
    // Wait for specified delay (default 2 seconds) for UI to update before capturing
    await new Promise(r => setTimeout(r, waitSeconds));

    try {
      const combinedStartTime = performance.now();
      const systemStateStartTime = performance.now();
      const screenshotStartTime = performance.now();
      
      console.log('[Timing] Starting parallel system state and screenshot capture...');
      
      // Get system state and screenshot in parallel
      const [stateResult, screenshotResult] = await Promise.all([
        IpcBridge.invoke<SystemState>(INVOKE_CHANNELS.GET_SYSTEM_STATE).then(result => {
          const systemStateTime = (performance.now() - systemStateStartTime) / 1000;
          console.log(`[Timing] Get system state completed: took ${systemStateTime.toFixed(3)}s`);
          return result;
        }),
        IpcBridge.invoke<ToolResult>(INVOKE_CHANNELS.EXECUTE_TOOL, {
          toolName: 'screenshot',
          args: {
            explanation: `Screenshot ${context}`,
            expectation: `State ${context}`
          },
          skipAutoCapture: false
        }).then(result => {
          const screenshotTime = (performance.now() - screenshotStartTime) / 1000;
          console.log(`[Timing] Screenshot capture completed: took ${screenshotTime.toFixed(3)}s`);
          return result;
        })
      ]);

      const combinedTime = (performance.now() - combinedStartTime) / 1000;
      console.log(`[Timing] Combined system state + screenshot (parallel): took ${combinedTime.toFixed(3)}s`);

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
    const startTime = performance.now();
    const shortId = options.correlationId ? options.correlationId.substring(0, 15) : 'unknown';
    console.log(`[Timing] Tool execution started: ${toolName} (request_id=${shortId})`);

    try {
      // Execute tool via IPC
      const result: ToolResult = await IpcBridge.invoke(INVOKE_CHANNELS.EXECUTE_TOOL, {
        toolName,
        args,
        skipAutoCapture: options.skipAutoCapture || false
      });

      const executionTime = (performance.now() - startTime) / 1000;
      console.log(`[Timing] Tool execution completed: ${toolName} took ${executionTime.toFixed(3)}s (request_id=${shortId})`);

      // Check if this is a computer-use tool that should have a screenshot
      const isComputerUseTool = COMPUTER_USE_TOOLS.includes(toolName);
      let screenshot = result.data?.screenshot || null;
      let systemState: SystemState | null = result.data?.system_state || null;

      // Capture screenshot and system state ONCE after individual tool execution if needed
      if (isComputerUseTool && !options.skipAutoCapture && !screenshot) {
        // Extract wait parameter from tool args (convert seconds to milliseconds)
        // Default to 2000ms (2 seconds) if not provided
        const waitSeconds = args && typeof args === 'object' && typeof args.wait === 'number'
          ? args.wait * 1000
          : 2000;
        
        const captureResult = await this.captureSystemStateAndScreenshot(`after ${toolName}`, waitSeconds);
        systemState = captureResult.systemState;
        screenshot = captureResult.screenshot;

        // Add screenshot to result data
        if (screenshot && result.data && typeof result.data === 'object') {
          result.data = {
            ...result.data,
            screenshot: screenshot,
            system_state: systemState
          };
        }
      }

      // Format complete message with system context XML
      const formattedMessage = formatToolOutputMessage(
        toolName,
        result,
        systemState || (result.data && typeof result.data === 'object' ? result.data.system_state : null)
      );

      // Prepare result
      const executionResult: ToolExecutionResult = {
        toolName,
        result,
        executionTime,
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

      return executionResult;
    } catch (error: any) {
      const executionTime = (performance.now() - startTime) / 1000;
      console.error(`[ToolExecutionService] Tool execution failed: ${error.message}`);

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
        executionTime,
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
          console.log(`[Timing] Bundled tool execution: ${tool.toolName} took ${toolExecutionTime.toFixed(3)}s`);

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
          console.error('[ToolExecutionService] Bundle tool execution failed:', err);

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
      const hasComputerUseTool = bundle.some(tool => 
        COMPUTER_USE_TOOLS.includes(tool.toolName)
      );

      // Get system state and screenshot ONCE after all bundled tools execute
      let systemState: SystemState | null = null;
      let screenshot: string | null = null;

      if (hasComputerUseTool) {
        // Extract wait parameter from the last computer-use tool in bundle (or max wait value)
        // Default to 2000ms (2 seconds) if not provided
        let waitSeconds = 2000;
        const computerUseTools = bundle.filter(tool => COMPUTER_USE_TOOLS.includes(tool.toolName));
        if (computerUseTools.length > 0) {
          // Use the wait value from the last computer-use tool, or find the maximum
          const waitValues = computerUseTools
            .map(tool => tool.args && typeof tool.args === 'object' && typeof tool.args.wait === 'number' ? tool.args.wait : null)
            .filter((w): w is number => w !== null);
          
          if (waitValues.length > 0) {
            // Use the maximum wait value from all computer-use tools in the bundle
            waitSeconds = Math.max(...waitValues) * 1000;
          }
        }
        
        const captureResult = await this.captureSystemStateAndScreenshot('after bundle execution', waitSeconds);
        systemState = captureResult.systemState;
        screenshot = captureResult.screenshot;
      } else {
        console.log('[ToolExecutionService] Skipping system state/screenshot (no computer-use tools in bundle)');
      }

      // Calculate execution time BEFORE formatting (formatting is overhead, not execution time)
      const bundleExecutionTime = (performance.now() - bundleStartTime) / 1000;
      console.log(`[Timing] Bundle execution completed: ${stepResults.length} steps took ${bundleExecutionTime.toFixed(3)}s (bundle_id=${bundleId})`);

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

      // Prepare bundle result for UI callback
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
        totalTime: bundleExecutionTime,
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

        this.callbacks.sendToBackend({
          type: 'tool-bundle-result',
          payload: {
            bundle_id: bundleId,
            status: bundleStatus,
            step_results: stepResults,
            screenshot: screenshot || null,
            system_state: systemState || null,
            error: bundleStatus === 'failure' ? (error?.message || 'Bundle execution failed') : null
          }
        });
      }

      return bundleResult;
    } catch (error: any) {
      const bundleTotalTime = (performance.now() - bundleStartTime) / 1000;
      console.error(`[Timing] Bundle execution failed after ${bundleTotalTime.toFixed(3)}s:`, error);
      console.error('[ToolExecutionService] Bundle execution failed:', error);

      // Send error bundle result to backend
      if (this.callbacks.sendToBackend) {
        this.callbacks.sendToBackend({
          type: 'tool-bundle-result',
          payload: {
            bundle_id: bundleId,
            status: 'failure',
            step_results: stepResults, // Partial results if any
            screenshot: null,
            system_state: null,
            error: error.message
          }
        });
      }

      throw error;
    }
  }
}
