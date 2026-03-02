/**
 * Shared types and configuration for tool execution.
 * Pure type/module definitions with no side effects.
 */

import type {
  ToolResult,
  SystemState,
  BundledToolResult,
} from './MessageFormatter';

/**
 * Tool execution options.
 */
export interface ToolExecutionOptions {
  skipAutoCapture?: boolean;
  correlationId: string;
}

/**
 * Tool execution result with metadata.
 */
export interface ToolExecutionResult {
  toolName: string;
  result: ToolResult;
  executionTime: number;
  correlationId: string;
  formattedMessage: string;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotContentType?: string | null;
  systemState?: SystemState | null;
}

/**
 * Bundle execution result.
 */
export interface BundleExecutionResult {
  correlationId: string;
  results: BundledToolResult[];
  totalTime: number;
  formattedMessage: string;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotContentType?: string | null;
  systemState?: SystemState | null;
}

/**
 * Callbacks for UI updates and backend communication.
 */
export interface ToolExecutionCallbacks {
  /**
   * Called when a tool result should be displayed in UI.
   */
  onToolResult?: (result: ToolExecutionResult) => void;

  /**
   * Called when a bundle result should be displayed in UI.
   */
  onBundleResult?: (result: BundleExecutionResult) => void;

  /**
   * Called to send tool result to backend.
   */
  sendToBackend?: (payload: any) => void;
}
