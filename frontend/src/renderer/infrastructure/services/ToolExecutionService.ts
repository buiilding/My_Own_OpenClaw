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

      // Capture screenshot and system state for computer-use tools if not already present
      if (isComputerUseTool && !options.skipAutoCapture && !screenshot) {
        console.log(`[ToolExecutionService] Capturing screenshot for individual computer-use tool: ${toolName}`);
        await new Promise(r => setTimeout(r, 2000)); // Small delay for UI to update

        try {
          const combinedStartTime = performance.now();
          const systemStateStartTime = performance.now();
          const screenshotStartTime = performance.now();
          
          console.log('[Timing] Starting parallel system state and screenshot capture...');
          
          const [stateResult, screenshotResult] = await Promise.all([
            IpcBridge.invoke<SystemState>(INVOKE_CHANNELS.GET_SYSTEM_STATE).then(result => {
              const systemStateTime = (performance.now() - systemStateStartTime) / 1000;
              console.log(`[Timing] Get system state completed: took ${systemStateTime.toFixed(3)}s`);
              return result;
            }),
            IpcBridge.invoke<ToolResult>(INVOKE_CHANNELS.EXECUTE_TOOL, {
              toolName: 'screenshot',
              args: {
                explanation: `Screenshot after ${toolName}`,
                expectation: 'State after tool execution'
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

          systemState = stateResult;
          screenshot = screenshotResult.success ? screenshotResult.data?.screenshot : null;

          // Add screenshot to result data
          if (screenshot && result.data && typeof result.data === 'object') {
            result.data = {
              ...result.data,
              screenshot: screenshot,
              system_state: systemState
            };
          }
        } catch (err) {
          console.error(`[ToolExecutionService] Failed to capture screenshot for ${toolName}:`, err);
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
   * Execute a bundle of tools sequentially
   */
  async executeToolBundle(
    bundle: ToolBundleItem[],
    correlationId: string
  ): Promise<BundleExecutionResult> {
    const bundleStartTime = performance.now();
    const results: BundledToolResult[] = [];
    console.log(`[Timing] Bundle execution started: ${bundle.length} tools (bundle_id=${correlationId})`);
    console.log('[ToolExecutionService] Executing bundle of size:', bundle.length);
    console.log('[ToolExecutionService] Bundle correlation ID:', correlationId);

    try {
      // Execute all tools sequentially with skipAutoCapture
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
          const shortId = tool.correlationId ? tool.correlationId.substring(0, 15) : 'unknown';
          console.log(`[Timing] Bundled tool execution: ${tool.toolName} took ${toolExecutionTime.toFixed(3)}s (request_id=${shortId})`);

          // Store raw result (will format with system_state at bundle end and display then)
          results.push({
            tool_name: tool.toolName,
            request_id: tool.correlationId,
            success: result.success,
            data: result.data,
            error: result.error,
            executionTime: toolExecutionTime,
            _rawResult: result // Store raw result for formatting later
          });

          // No delay needed here - the keyboard tool handles timing internally
        } catch (err: any) {
          const toolExecutionTime = (performance.now() - toolStartTime) / 1000;
          console.error('[ToolExecutionService] Bundle tool execution failed:', err);

          // Store raw error result
          results.push({
            tool_name: tool.toolName,
            request_id: tool.correlationId,
            success: false,
            error: err.message,
            executionTime: toolExecutionTime,
            _rawResult: { success: false, error: err.message, data: null }
          });
        }
      }

      // Check if any tool in bundle is a computer-use tool
      const hasComputerUseTool = bundle.some(tool => 
        COMPUTER_USE_TOOLS.includes(tool.toolName)
      );

      // Get system state and screenshot ONCE at bundle end
      let systemState: SystemState | null = null;
      let screenshot: string | null = null;

      if (hasComputerUseTool) {
        console.log('[ToolExecutionService] Getting system state and screenshot (computer-use tool detected)...');
        await new Promise(r => setTimeout(r, 2000)); // 2s delay for UI to update

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
                explanation: 'Bundle end screenshot',
                expectation: 'State after bundle'
              },
              skipAutoCapture: false // Don't skip for final screenshot
            }).then(result => {
              const screenshotTime = (performance.now() - screenshotStartTime) / 1000;
              console.log(`[Timing] Screenshot capture completed: took ${screenshotTime.toFixed(3)}s`);
              return result;
            })
          ]);

          const combinedTime = (performance.now() - combinedStartTime) / 1000;
          console.log(`[Timing] Combined system state + screenshot (parallel): took ${combinedTime.toFixed(3)}s`);

          systemState = stateResult;
          screenshot = screenshotResult.success && screenshotResult.data && typeof screenshotResult.data === 'object'
            ? screenshotResult.data.screenshot || null
            : null;
        } catch (err) {
          console.error('[ToolExecutionService] Failed to get system state/screenshot:', err);
        }
      } else {
        console.log('[ToolExecutionService] Skipping system state/screenshot (no computer-use tools in bundle)');
      }

      // Format combined bundled message for display and backend
      const combinedFormattedMessage = formatBundledToolOutputMessage(
        results.map(r => ({
          tool_name: r.tool_name,
          _rawResult: r._rawResult,
          success: r.success,
          error: r.error,
          data: r.data
        })),
        systemState,
        screenshot
      );

      // Prepare bundle result
      const bundleResult: BundleExecutionResult = {
        correlationId,
        results,
        totalTime: (performance.now() - bundleStartTime) / 1000,
        formattedMessage: combinedFormattedMessage,
        screenshot,
        systemState
      };

      // Call UI callback
      if (this.callbacks.onBundleResult) {
        this.callbacks.onBundleResult(bundleResult);
      }

      // Format individual tools for backend (still needed for orchestrator to match request_ids)
      const formattedTools = results.map(toolResult => {
        // Include bundle screenshot in tool result data if present
        const toolDataWithScreenshot = screenshot && toolResult.data
          ? { ...toolResult.data, screenshot: screenshot }
          : toolResult.data;

        return {
          tool_name: toolResult.tool_name,
          request_id: toolResult.request_id,
          success: toolResult.success,
          data: {
            ...(toolDataWithScreenshot && typeof toolDataWithScreenshot === 'object' ? toolDataWithScreenshot : {}),
            // Individual tool llm_content for orchestrator matching
            llm_content: formatToolOutputMessage(
              toolResult.tool_name,
              toolResult._rawResult || { success: toolResult.success, error: toolResult.error, data: toolDataWithScreenshot },
              systemState
            ),
            is_preformatted: true,
          },
          error: toolResult.error
        };
      });

      // Send bundled result to backend
      if (this.callbacks.sendToBackend) {
        const bundleTotalTime = (performance.now() - bundleStartTime) / 1000;
        console.log(`[Timing] Bundle execution completed: ${bundle.length} tools took ${bundleTotalTime.toFixed(3)}s (bundle_id=${correlationId})`);
        console.log('[ToolExecutionService] Sending bundled result');

        this.callbacks.sendToBackend({
          type: 'tool-result',
          payload: {
            request_id: correlationId,
            success: true,
            data: {
              bundled: true,
              tools: formattedTools, // Individual tools for orchestrator matching
              combined_llm_content: combinedFormattedMessage, // Combined message for history
              system_state: systemState,
              screenshot: screenshot
            }
          }
        });
      }

      return bundleResult;
    } catch (error: any) {
      const bundleTotalTime = (performance.now() - bundleStartTime) / 1000;
      console.error(`[Timing] Bundle execution failed after ${bundleTotalTime.toFixed(3)}s:`, error);
      console.error('[ToolExecutionService] Bundle execution failed:', error);

      // Send error result to backend
      if (this.callbacks.sendToBackend) {
        this.callbacks.sendToBackend({
          type: 'tool-result',
          payload: {
            request_id: correlationId,
            success: false,
            error: error.message
          }
        });
      }

      throw error;
    }
  }
}
