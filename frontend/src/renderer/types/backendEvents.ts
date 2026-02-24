import type { TokenCounts } from '../features/chat/stores/chatStore';

export type BackendEventType =
  | 'llm-thought'
  | 'streaming-response'
  | 'streaming-complete'
  | 'tool-call'
  | 'tool-output'
  | 'tool-bundle'
  | 'local-user-message'
  | 'system-prompt'
  | 'user-message-full'
  | 'assistant-message-full'
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

export type ToolFunctionSchema = {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
};

export type ToolSchema = {
  type: 'function';
  function: ToolFunctionSchema;
};

export type LlmThoughtEvent = BackendEventBase<'llm-thought', { status?: string }>;
export type StreamingResponseEvent = BackendEventBase<'streaming-response', { text?: string }>;
export type StreamingCompleteEvent = BackendEventBase<'streaming-complete'>;
export type ToolCallEvent = BackendEventBase<'tool-call', {
  tool_name?: string;
  parameters?: Record<string, unknown>;
  correlation_id?: string;
  request_id?: string;
  metadata?: Record<string, unknown> & {
    model_facing_tool_call?: {
      id?: string;
      name?: string;
      arguments?: Record<string, unknown>;
    };
  };
}>;
export type ToolOutputEvent = BackendEventBase<'tool-output', {
  tool_name?: string;
  success?: boolean;
  execution_time?: number | null;
  output?: string;
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
      };
    };
  }>;
}>;
export type LocalUserMessageEvent = BackendEventBase<'local-user-message', {
  text?: string;
  screenshot?: string | null;
  screenshot_ref?: string | null;
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
  | ToolCallEvent
  | ToolOutputEvent
  | ToolBundleEvent
  | LocalUserMessageEvent
  | SystemPromptEvent
  | UserMessageFullEvent
  | AssistantMessageFullEvent
  | TokenCountEvent
  | ToolSchemasEvent
  | ErrorEvent;

const BACKEND_EVENT_TYPES = new Set<BackendEventType>([
  'llm-thought',
  'streaming-response',
  'streaming-complete',
  'tool-call',
  'tool-output',
  'tool-bundle',
  'local-user-message',
  'system-prompt',
  'user-message-full',
  'assistant-message-full',
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
