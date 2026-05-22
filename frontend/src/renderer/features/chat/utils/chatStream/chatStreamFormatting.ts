import type {
  ToolBundleEvent,
  ToolCallEvent,
  ToolOutputEvent,
} from '../../../../types/backendEvents';
import {
  buildNormalizedToolCall,
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../../../infrastructure/transcript/toolCallMessageState';

const MAX_THINKING_STATUS_LENGTH = 5000;

type ToolCallPayloadLike = ToolCallEvent['payload'];
type ToolBundlePayloadLike = ToolBundleEvent['payload'];
type ToolOutputPayloadLike = ToolOutputEvent['payload'];

export function buildThinkingStatus(currentStatus: string | null, chunk?: string): string {
  const updated = (currentStatus || '') + (chunk || '');
  return updated.length > MAX_THINKING_STATUS_LENGTH
    ? updated.slice(-MAX_THINKING_STATUS_LENGTH)
    : updated;
}

export function formatToolCallPayload(payload?: ToolCallPayloadLike): string {
  return buildToolCallMessageState({
    rawToolCall: payload?.metadata?.model_facing_tool_call || null,
    fallbackToolName: payload?.tool_name || null,
    fallbackToolCallId: payload?.request_id || null,
    fallbackArguments: payload?.parameters || null,
    metadata: payload?.metadata || null,
    toolCallDetails: payload || null,
  }).text;
}

export function formatToolBundlePayload(payload?: ToolBundlePayloadLike): string {
  return buildToolBundleMessageState(payload).text;
}

export function formatToolOutputText(payload?: ToolOutputPayloadLike): string {
  if (typeof payload?.display_content === 'string' && payload.display_content.length > 0) {
    return payload.display_content;
  }
  if (typeof payload?.output === 'string' && payload.output.length > 0) {
    return payload.output;
  }
  if (payload?.error) {
    return `Error: ${payload.error}`;
  }
  return 'No output';
}

export function resolveModelFacingToolCall(payload?: ToolCallPayloadLike): {
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  thought_signature?: string;
  raw_tool_call_preview?: string;
  raw_arguments_preview?: string;
  parse_error?: string;
  frontend_execution_skipped?: boolean;
} {
  return buildNormalizedToolCall({
    rawToolCall: payload?.metadata?.model_facing_tool_call || null,
    fallbackToolName: payload?.tool_name || null,
    fallbackToolCallId: payload?.request_id || null,
    fallbackArguments: payload?.parameters || null,
    metadata: payload?.metadata || null,
  }) || {};
}
