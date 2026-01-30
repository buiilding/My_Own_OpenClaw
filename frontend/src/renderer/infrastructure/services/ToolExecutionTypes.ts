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
 * Computer-use tools that require screenshots.
 */
export const COMPUTER_USE_TOOLS: string[] = [
  'mouse_control',
  'keyboard_control',
  'scroll_control',
  'screenshot',
  'wait',
  'switch_tab',
];

/**
 * Tool execution options.
 */
export interface ToolExecutionOptions {
  skipAutoCapture?: boolean;
  correlationId: string;
}

/**
 * Tool bundle item.
 */
export interface ToolBundleItem {
  toolName: string;
  args: any;
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

