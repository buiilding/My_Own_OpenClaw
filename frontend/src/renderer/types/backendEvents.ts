import type { TokenCounts } from '../features/chat/stores/chatStore';

export type BackendEventType =
  | 'llm-thought'
  | 'streaming-response'
  | 'streaming-complete'
  | 'context-compaction-started'
  | 'context-compaction-completed'
  | 'context-compaction-failed'
  | 'tool-call'
  | 'tool-output'
  | 'tool-bundle'
  | 'web-search-progress'
  | 'local-user-message'
  | 'system-prompt'
  | 'user-message-full'
  | 'assistant-message-full'
  | 'memory-store'
  | 'token-count'
  | 'tool-schemas'
  | 'error';

export type BackendEventBase<TType extends BackendEventType, TPayload = undefined> = {
  type: TType;
  payload?: TPayload;
  id?: string;
  session_id?: string;
  user_id?: string;
  conversation_ref?: string;
  turn_ref?: string;
};

export type ToolSchema = {
  type: string;
  name?: string;
  description?: string;
  strict?: boolean;
  parameters?: Record<string, unknown>;
  function?: {
    name?: string;
    parameters?: Record<string, unknown>;
  } & Record<string, unknown>;
} & Record<string, unknown>;

export type LlmThoughtEvent = BackendEventBase<'llm-thought', { status?: string }>;
export type StreamingResponseEvent = BackendEventBase<'streaming-response', { text?: string }>;
export type StreamingCompleteEvent = BackendEventBase<'streaming-complete', {
  final_response?: string;
}>;
export type ContextCompactionStartedEvent = BackendEventBase<'context-compaction-started', {
  reason?: string;
  strategy?: string;
  before_tokens?: number;
  projected_tokens?: number;
}>;
export type ContextCompactionCompletedEvent = BackendEventBase<'context-compaction-completed', {
  reason?: string;
  strategy?: string;
  before_tokens?: number;
  after_tokens?: number;
  removed_messages?: number;
  summary_preview?: string | null;
  summary_text?: string | null;
  replacement_history_preview?: Array<{
    role?: string | null;
    message_type?: string | null;
    content?: string | null;
    tool_name?: string | null;
    tool_call_id?: string | null;
  }> | null;
  replacement_history_entries?: Array<Record<string, unknown>> | null;
  skipped_reason?: string | null;
}>;
export type ContextCompactionFailedEvent = BackendEventBase<'context-compaction-failed', {
  reason?: string;
  strategy?: string;
  error?: string;
  before_tokens?: number | null;
}>;
export type ToolCallEvent = BackendEventBase<'tool-call', {
  tool_name?: string;
  parameters?: Record<string, unknown>;
  correlation_id?: string;
  request_id?: string;
  metadata?: Record<string, unknown> & {
    llm_tool_call_validation_failed?: boolean;
    llm_tool_call_raw_tool_call_preview?: string;
    llm_tool_call_raw_arguments_preview?: string;
    llm_tool_call_raw_arguments_preview_truncated?: boolean;
    llm_tool_call_parse_error?: string;
    skip_frontend_execution?: boolean;
    model_facing_tool_call?: {
      id?: string;
      name?: string;
      arguments?: Record<string, unknown>;
      thought_signature?: string;
      thoughtSignature?: string;
    };
  };
}>;
export type ToolOutputEvent = BackendEventBase<'tool-output', {
  tool_name?: string;
  success?: boolean;
  execution_time?: number | null;
  output?: string;
  display_content?: string;
  model_llm_content?: string;
  llm_content_original_tokens?: number | null;
  llm_content_token_limit?: number | null;
  llm_content_truncated?: boolean;
  llm_content_token_source?: string | null;
  error?: string | null;
  screenshot?: string | null;
  screenshot_ref?: string | null;
  metadata?: Record<string, unknown>;
  request_id?: string;
}>;
export type ToolBundleEvent = BackendEventBase<'tool-bundle', {
  bundle_id?: string;
  tools?: Array<{
    name?: string;
    args?: Record<string, unknown>;
    metadata?: Record<string, unknown> & {
      model_facing_tool_call?: {
        id?: string;
        name?: string;
        arguments?: Record<string, unknown>;
        thought_signature?: string;
        thoughtSignature?: string;
      };
    };
  }>;
  }>;
export type WebSearchProgressEvent = BackendEventBase<'web-search-progress', {
  text?: string;
  request_id?: string | null;
  action_type?: string | null;
  query?: string | null;
  url?: string | null;
  pattern?: string | null;
}>;
export type LocalUserMessageEvent = BackendEventBase<'local-user-message', {
  text?: string;
  screenshot?: string | null;
  screenshot_ref?: string | null;
  screenshot_refs?: string[] | null;
  attachment_filenames?: string[] | null;
  screenshot_url?: string | null;
  timestamp?: string;
  session_id?: string | null;
  user_id?: string | null;
  conversation_ref?: string | null;
}>;
export type SystemPromptEvent = BackendEventBase<'system-prompt', {
  content?: string;
  tool_schemas?: ToolSchema[];
}>;
export type UserMessageFullEvent = BackendEventBase<'user-message-full', {
  content?: string;
  metadata?: Record<string, unknown>;
}>;
export type AssistantMessageFullEvent = BackendEventBase<'assistant-message-full', {
  content?: string;
}>;
export type MemoryStoreEvent = BackendEventBase<'memory-store', {
  user_query?: string;
  assistant_response?: string;
  memory_type?: string;
  user_id?: string;
  session_id?: string;
}>;
export type TokenCountEvent = BackendEventBase<'token-count', TokenCounts>;
export type ToolSchemasEvent = BackendEventBase<'tool-schemas', {
  tool_schemas?: ToolSchema[];
}>;
export type ErrorEvent = BackendEventBase<'error', {
  message?: string;
  content?: string | null;
}>;

export type BackendEvent =
  | LlmThoughtEvent
  | StreamingResponseEvent
  | StreamingCompleteEvent
  | ContextCompactionStartedEvent
  | ContextCompactionCompletedEvent
  | ContextCompactionFailedEvent
  | ToolCallEvent
  | ToolOutputEvent
  | ToolBundleEvent
  | WebSearchProgressEvent
  | LocalUserMessageEvent
  | SystemPromptEvent
  | UserMessageFullEvent
  | AssistantMessageFullEvent
  | MemoryStoreEvent
  | TokenCountEvent
  | ToolSchemasEvent
  | ErrorEvent;

const BACKEND_EVENT_TYPES = new Set<BackendEventType>([
  'llm-thought',
  'streaming-response',
  'streaming-complete',
  'context-compaction-started',
  'context-compaction-completed',
  'context-compaction-failed',
  'tool-call',
  'tool-output',
  'tool-bundle',
  'web-search-progress',
  'local-user-message',
  'system-prompt',
  'user-message-full',
  'assistant-message-full',
  'memory-store',
  'token-count',
  'tool-schemas',
  'error'
]);

export function isBackendEvent(value: unknown): value is BackendEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { type?: unknown };
  return typeof candidate.type === 'string' && BACKEND_EVENT_TYPES.has(candidate.type as BackendEventType);
}
