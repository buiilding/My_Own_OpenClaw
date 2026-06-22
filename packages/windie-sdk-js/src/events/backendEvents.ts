/**
 * Provides the backend events module for the TypeScript SDK runtime.
 */

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
  | 'audio-chunk'
  | 'wakeword-activated'
  | 'wakeword-greeting'
  | 'settings-loaded'
  | 'settings-updated'
  | 'models-listed'
  | 'local-user-message'
  | 'system-prompt'
  | 'user-message-full'
  | 'assistant-message-full'
  | 'token-count'
  | 'tool-schemas'
  | 'trace-event'
  | 'model-history-updated'
  | 'error';

export type BackendEventBase<TType extends BackendEventType, TPayload = undefined> = {
  type: TType;
  payload?: TPayload;
  id?: string;
  event_id?: string;
  sequence?: number;
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

export type BackendTraceEventPayload = {
  schemaVersion?: 1;
  path?: string;
  stage?: string;
  status?: 'started' | 'succeeded' | 'failed' | 'skipped';
  runtime?: 'sdk' | 'electron-main' | 'renderer' | 'local-runtime' | 'backend' | 'provider';
  traceId?: string | null;
  spanId?: string | null;
  parentSpanId?: string | null;
  requestId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  data?: Record<string, unknown> | null;
  error?: ({ code?: string; message?: string } & Record<string, unknown>) | null;
} & Record<string, unknown>;

export type BackendEvent =
  | BackendEventBase<'query-accepted', { status?: string }>
  | BackendEventBase<'llm-thought', { status?: string }>
  | BackendEventBase<'streaming-response', { text?: string }>
  | BackendEventBase<'streaming-complete', { final_response?: string }>
  | BackendEventBase<'context-compaction-started', Record<string, unknown>>
  | BackendEventBase<'context-compaction-completed', Record<string, unknown>>
  | BackendEventBase<'context-compaction-failed', Record<string, unknown>>
  | BackendEventBase<'tool-call', {
    tool_name?: string;
    parameters?: Record<string, unknown>;
    correlation_id?: string;
    request_id?: string;
    tool_call_id?: string;
    metadata?: Record<string, unknown> & {
      skip_local_execution?: boolean;
      execution_owner?: string;
      model_facing_tool_call?: Record<string, unknown>;
    };
  }>
  | BackendEventBase<'tool-output', Record<string, unknown>>
  | BackendEventBase<'tool-bundle', {
    bundle_id?: string;
    tools?: Array<{
      name?: string;
      args?: Record<string, unknown>;
      metadata?: Record<string, unknown> & {
        model_facing_tool_call?: Record<string, unknown>;
      };
    }>;
    metadata?: Record<string, unknown>;
  }>
  | BackendEventBase<'web-search-progress', Record<string, unknown>>
  | BackendEventBase<'audio-chunk', { audio?: string; sample_rate?: number }>
  | BackendEventBase<'wakeword-activated', Record<string, unknown>>
  | BackendEventBase<'wakeword-greeting', { text?: string }>
  | BackendEventBase<'settings-loaded', { config?: Record<string, unknown> }>
  | BackendEventBase<'settings-updated', { updated_keys?: string[] }>
  | BackendEventBase<'models-listed', Record<string, unknown>[]>
  | BackendEventBase<'local-user-message', Record<string, unknown>>
  | BackendEventBase<'system-prompt', { content?: string; tool_schemas?: ToolSchema[] }>
  | BackendEventBase<'user-message-full', Record<string, unknown>>
  | BackendEventBase<'assistant-message-full', Record<string, unknown>>
  | BackendEventBase<'token-count', Record<string, unknown>>
  | BackendEventBase<'tool-schemas', { tool_schemas?: ToolSchema[] }>
  | BackendEventBase<'trace-event', BackendTraceEventPayload>
  | BackendEventBase<'model-history-updated', Record<string, unknown>>
  | BackendEventBase<'error', { message?: string; content?: string | null }>;

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
  'audio-chunk',
  'wakeword-activated',
  'wakeword-greeting',
  'settings-loaded',
  'settings-updated',
  'models-listed',
  'local-user-message',
  'system-prompt',
  'user-message-full',
  'assistant-message-full',
  'token-count',
  'tool-schemas',
  'trace-event',
  'model-history-updated',
  'error',
]);

export function isBackendEvent(value: unknown): value is BackendEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { type?: unknown };
  return typeof candidate.type === 'string' && BACKEND_EVENT_TYPES.has(candidate.type as BackendEventType);
}
