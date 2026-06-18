/**
 * Defines renderer chat message contracts shared by runtime projection and UI state.
 */

import type { ToolSchema } from '../../types/toolSchemas';

export interface TokenCounts {
  prompt_tokens?: number;
  visible_output_tokens?: number;
  thinking_tokens?: number | null;
  output_tokens_total?: number;
  total_tokens?: number;
  conversation_tokens?: number;
  usage_source?: 'provider' | 'estimated';
  cached_tokens?: number | null;
  cache_hit?: boolean | null;
  cache_status?: 'hit' | 'miss' | 'unknown' | null;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  turnRef?: string;
  type?: 'llm-text' | 'tool-call' | 'tool-output' | 'tool-explanation' | 'tool-actions-summary' | 'search-source' | 'error';
  sourceEventType?: string | null;
  sourceChannel?: string | null;
  isComplete?: boolean;
  screenshot?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  screenshotContentType?: string | null;
  attachmentFilenames?: string[] | null;
  screenshots?: Array<{
    screenshot?: string | null;
    screenshotRef?: string | null;
    screenshotUrl?: string | null;
    screenshotContentType?: string | null;
  }> | null;
  modelId?: string | null;
  modelProvider?: string | null;
  toolMetadata?: Record<string, unknown> | null;
  toolName?: string;
  executionTime?: number | null;
  success?: boolean;
  correlationId?: string;
  timestamp?: string;
  modelFacingToolCall?: {
    id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    thought_signature?: string;
    raw_tool_call_preview?: string;
    raw_arguments_preview?: string;
    parse_error?: string;
    execution_skipped?: boolean;
  } | null;
  toolCallDisplayText?: string | null;
  modelFacingToolOutput?: string | null;
  toolCallDetails?: Record<string, unknown> | null;
  toolOutputDetails?: Record<string, unknown> | null;
  actionExplanations?: string[] | null;
  systemPrompt?: {
    content: string;
    toolSchemas?: ToolSchema[];
  };
  toolSchemas?: ToolSchema[];
  fullUserMessage?: {
    content: string;
    metadata?: Record<string, unknown>;
  };
  fullAssistantMessage?: {
    content: string;
  };
  feedback?: 'like' | 'dislike' | null;
  thinkingText?: string | null;
  thinkingSourceEventType?: string | null;
  tokenCounts?: TokenCounts | null;
}
