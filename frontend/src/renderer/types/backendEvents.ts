import type { TokenCounts } from '../features/chat/stores/chatStore';

export type BackendEventType =
  | 'query-accepted'
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

export type QueryAcceptedEvent = BackendEventBase<'query-accepted', {
  status?: string;
}>;
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
  | QueryAcceptedEvent
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
  'query-accepted',
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

type UnknownRecord = Record<string, unknown>;
type FieldValidator = (value: unknown) => boolean;
type PayloadValidator = (payload: UnknownRecord) => boolean;

const BASE_CONTEXT_FIELDS = [
  'id',
  'session_id',
  'user_id',
  'conversation_ref',
  'turn_ref',
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalStringOrNull(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function optionalNumberOrNull(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value));
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function optionalBooleanOrNull(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'boolean';
}

function optionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

function optionalStringArrayOrNull(value: unknown): boolean {
  return value === undefined
    || value === null
    || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function optionalRecordArrayOrNull(value: unknown): boolean {
  return value === undefined
    || value === null
    || (Array.isArray(value) && value.every((item) => isRecord(item)));
}

function validateFields(payload: UnknownRecord, validators: Record<string, FieldValidator>): boolean {
  return Object.entries(validators).every(([field, validator]) => validator(payload[field]));
}

function optionalModelFacingToolCall(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return validateFields(value, {
    id: optionalString,
    name: optionalString,
    arguments: optionalRecord,
    thought_signature: optionalString,
    thoughtSignature: optionalString,
  });
}

function optionalToolMetadata(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return validateFields(value, {
    llm_tool_call_validation_failed: optionalBoolean,
    llm_tool_call_raw_tool_call_preview: optionalString,
    llm_tool_call_raw_arguments_preview: optionalString,
    llm_tool_call_raw_arguments_preview_truncated: optionalBoolean,
    llm_tool_call_parse_error: optionalString,
    skip_frontend_execution: optionalBoolean,
    model_facing_tool_call: optionalModelFacingToolCall,
  });
}

function optionalToolSchema(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }
  if (value.function !== undefined && !isRecord(value.function)) {
    return false;
  }
  const functionRecord = isRecord(value.function) ? value.function : {};
  return validateFields(value, {
    name: optionalString,
    description: optionalString,
    strict: optionalBoolean,
    parameters: optionalRecord,
  }) && validateFields(functionRecord, {
    name: optionalString,
    parameters: optionalRecord,
  });
}

function optionalToolSchemaArray(value: unknown): boolean {
  return value === undefined
    || (Array.isArray(value) && value.every((item) => optionalToolSchema(item)));
}

function optionalBundleTools(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((tool) => {
    if (!isRecord(tool)) {
      return false;
    }
    return validateFields(tool, {
      name: optionalString,
      args: optionalRecord,
      metadata: optionalToolMetadata,
    });
  });
}

function validateTokenCounts(payload: UnknownRecord): boolean {
  return validateFields(payload, {
    prompt_tokens: optionalNumber,
    visible_output_tokens: optionalNumber,
    thinking_tokens: optionalNumberOrNull,
    output_tokens_total: optionalNumber,
    total_tokens: optionalNumber,
    conversation_tokens: optionalNumber,
    cached_tokens: optionalNumberOrNull,
    cache_hit: optionalBooleanOrNull,
  }) && (
    payload.usage_source === undefined
    || payload.usage_source === 'provider'
    || payload.usage_source === 'estimated'
  ) && (
    payload.cache_status === undefined
    || payload.cache_status === null
    || payload.cache_status === 'hit'
    || payload.cache_status === 'miss'
    || payload.cache_status === 'unknown'
  );
}

const PAYLOAD_VALIDATORS: Record<BackendEventType, PayloadValidator> = {
  'query-accepted': (payload) => validateFields(payload, {
    status: optionalString,
  }),
  'llm-thought': (payload) => validateFields(payload, {
    status: optionalString,
  }),
  'streaming-response': (payload) => validateFields(payload, {
    text: optionalString,
  }),
  'streaming-complete': (payload) => validateFields(payload, {
    final_response: optionalString,
  }),
  'context-compaction-started': (payload) => validateFields(payload, {
    reason: optionalString,
    strategy: optionalString,
    before_tokens: optionalNumber,
    projected_tokens: optionalNumber,
  }),
  'context-compaction-completed': (payload) => validateFields(payload, {
    reason: optionalString,
    strategy: optionalString,
    before_tokens: optionalNumber,
    after_tokens: optionalNumber,
    removed_messages: optionalNumber,
    summary_preview: optionalStringOrNull,
    summary_text: optionalStringOrNull,
    replacement_history_preview: optionalRecordArrayOrNull,
    replacement_history_entries: optionalRecordArrayOrNull,
    skipped_reason: optionalStringOrNull,
  }),
  'context-compaction-failed': (payload) => validateFields(payload, {
    reason: optionalString,
    strategy: optionalString,
    error: optionalString,
    before_tokens: optionalNumberOrNull,
  }),
  'tool-call': (payload) => validateFields(payload, {
    tool_name: optionalString,
    parameters: optionalRecord,
    correlation_id: optionalString,
    request_id: optionalString,
    metadata: optionalToolMetadata,
  }),
  'tool-output': (payload) => validateFields(payload, {
    tool_name: optionalString,
    success: optionalBoolean,
    execution_time: optionalNumberOrNull,
    output: optionalString,
    display_content: optionalString,
    model_llm_content: optionalString,
    llm_content_original_tokens: optionalNumberOrNull,
    llm_content_token_limit: optionalNumberOrNull,
    llm_content_truncated: optionalBoolean,
    llm_content_token_source: optionalStringOrNull,
    error: optionalStringOrNull,
    screenshot: optionalStringOrNull,
    screenshot_ref: optionalStringOrNull,
    metadata: optionalRecord,
    request_id: optionalString,
  }),
  'tool-bundle': (payload) => validateFields(payload, {
    bundle_id: optionalString,
    tools: optionalBundleTools,
  }),
  'web-search-progress': (payload) => validateFields(payload, {
    text: optionalString,
    request_id: optionalStringOrNull,
    action_type: optionalStringOrNull,
    query: optionalStringOrNull,
    url: optionalStringOrNull,
    pattern: optionalStringOrNull,
  }),
  'local-user-message': (payload) => validateFields(payload, {
    text: optionalString,
    screenshot: optionalStringOrNull,
    screenshot_ref: optionalStringOrNull,
    screenshot_refs: optionalStringArrayOrNull,
    attachment_filenames: optionalStringArrayOrNull,
    screenshot_url: optionalStringOrNull,
    timestamp: optionalString,
    session_id: optionalStringOrNull,
    user_id: optionalStringOrNull,
    conversation_ref: optionalStringOrNull,
  }),
  'system-prompt': (payload) => validateFields(payload, {
    content: optionalString,
    tool_schemas: optionalToolSchemaArray,
  }),
  'user-message-full': (payload) => validateFields(payload, {
    content: optionalString,
    metadata: optionalRecord,
  }),
  'assistant-message-full': (payload) => validateFields(payload, {
    content: optionalString,
  }),
  'memory-store': (payload) => validateFields(payload, {
    user_query: optionalString,
    assistant_response: optionalString,
    memory_type: optionalString,
    user_id: optionalString,
    session_id: optionalString,
  }),
  'token-count': validateTokenCounts,
  'tool-schemas': (payload) => validateFields(payload, {
    tool_schemas: optionalToolSchemaArray,
  }),
  error: (payload) => validateFields(payload, {
    message: optionalString,
    content: optionalStringOrNull,
  }),
};

function hasValidBaseContext(candidate: UnknownRecord): boolean {
  return BASE_CONTEXT_FIELDS.every((field) => optionalString(candidate[field]));
}

export function isBackendEvent(value: unknown): value is BackendEvent {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }
  if (!BACKEND_EVENT_TYPES.has(value.type as BackendEventType) || !hasValidBaseContext(value)) {
    return false;
  }
  if (value.payload === undefined) {
    return true;
  }
  if (!isRecord(value.payload)) {
    return false;
  }
  const validatePayload = PAYLOAD_VALIDATORS[value.type as BackendEventType];
  return validatePayload(value.payload);
}
