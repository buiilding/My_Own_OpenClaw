/**
 * Provides the backend event normalizer module for the TypeScript SDK runtime.
 */

import type { BackendEvent } from '../events/backendEvents.js';
import { createConversationEvent, createRuntimeId } from '../conversation/events.js';
import type {
  ConversationEvent,
  JsonRecord,
  TraceError,
  TraceEventPayload,
  TraceRuntime,
  TraceStatus,
} from '../conversation/types.js';
import { sanitizeTraceData } from '../runtime/TraceRecorder.js';
import { resolveModelFacingToolCallId } from '../tools/toolCorrelationIds.js';

function payloadOf(event: BackendEvent): JsonRecord {
  return (event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload))
    ? event.payload as JsonRecord
    : {};
}

function conversationRefOf(event: BackendEvent): string | null {
  if (typeof event.conversation_ref === 'string' && event.conversation_ref.trim()) {
    return event.conversation_ref.trim();
  }
  return null;
}

function scopedErrorTurnRef(event: BackendEvent, fallbackTurnRef?: string): string | null {
  if (event.type === 'error') {
    const payload = payloadOf(event);
    const payloadTurnRef = stringField(payload, 'turn_ref');
    if (payloadTurnRef?.trim()) {
      return payloadTurnRef.trim();
    }
  }
  if (typeof event.turn_ref === 'string' && event.turn_ref.trim()) {
    return event.turn_ref.trim();
  }
  if (event.type !== 'error') {
    return null;
  }
  const eventId = typeof event.id === 'string' && event.id.trim()
    ? event.id.trim()
    : null;
  const fallback = typeof fallbackTurnRef === 'string' && fallbackTurnRef.trim()
    ? fallbackTurnRef.trim()
    : null;
  if (eventId && fallback && eventId === fallback) {
    return eventId;
  }
  if (!eventId && fallback) {
    return fallback;
  }
  return null;
}

function stringFromEventPayloadOrTopLevel(event: BackendEvent, key: string): string | null {
  const payload = payloadOf(event);
  const payloadValue = payload[key];
  if (typeof payloadValue === 'string') {
    return payloadValue;
  }
  const topLevelValue = (event as unknown as JsonRecord)[key];
  return typeof topLevelValue === 'string' ? topLevelValue : null;
}

function stringField(record: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

function toolCorrelationIdFromPayload(payload: JsonRecord): string | null {
  return stringField(payload, 'correlation_id', 'request_id');
}

function normalizeToolBundleTools(tools: unknown): JsonRecord[] {
  if (!Array.isArray(tools)) {
    return [];
  }
  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
      return [];
    }
    const record = tool as JsonRecord;
    const name = typeof record.name === 'string' ? record.name : null;
    if (!name) {
      return [];
    }
    const args = record.args && typeof record.args === 'object' && !Array.isArray(record.args)
      ? record.args as JsonRecord
      : {};
    const toolCallId = typeof record.tool_call_id === 'string'
      ? record.tool_call_id
      : resolveModelFacingToolCallId(record);
    return [{
      name,
      args,
      ...(toolCallId ? { toolCallId } : {}),
    }];
  });
}

function revisionIdFor(event: BackendEvent, fallbackRevisionId?: string): string {
  const payload = payloadOf(event);
  if (typeof payload.revision_id === 'string' && payload.revision_id.trim()) {
    return payload.revision_id.trim();
  }
  return fallbackRevisionId || createRuntimeId('rev');
}

function eventBase(
  event: BackendEvent,
  fallbackRevisionId?: string,
  fallbackConversationRef?: string,
  fallbackTurnRef?: string,
): { conversationRef: string; revisionId: string; turnRef: string | null; eventId: string; timestamp: string } | null {
  const turnRef = scopedErrorTurnRef(event, fallbackTurnRef);
  const conversationRef = conversationRefOf(event) ?? (
    event.type === 'error' && turnRef ? fallbackConversationRef : null
  ) ?? null;
  if (!conversationRef) {
    return null;
  }
  if (typeof event.event_id !== 'string' || !event.event_id.trim()) {
    return {
      conversationRef,
      revisionId: revisionIdFor(event, fallbackRevisionId),
      turnRef,
      eventId: createRuntimeId('evt'),
      timestamp: new Date().toISOString(),
    };
  }
  return {
    conversationRef,
    revisionId: revisionIdFor(event, fallbackRevisionId),
    turnRef,
    eventId: event.event_id.trim(),
    timestamp: new Date().toISOString(),
  };
}

function backendSequenceOf(event: BackendEvent): number | null {
  return Number.isInteger(event.sequence) && (event.sequence ?? 0) > 0
    ? event.sequence as number
    : null;
}

function backendEventMetadata(event: BackendEvent): JsonRecord {
  return {
    backendSequence: backendSequenceOf(event),
    rawEvent: event as unknown as JsonRecord,
  };
}

function numberField(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function traceStringField(record: JsonRecord, ...keys: string[]): string | null {
  const value = stringField(record, ...keys);
  return value && value.trim() ? value.trim() : null;
}

function traceNumberField(record: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

const TRACE_STATUSES = new Set<TraceStatus>(['started', 'succeeded', 'failed', 'skipped']);
const TRACE_RUNTIMES = new Set<TraceRuntime>([
  'sdk',
  'electron-main',
  'renderer',
  'local-runtime',
  'backend',
  'provider',
]);

function traceStatusOf(value: unknown): TraceStatus | null {
  return typeof value === 'string' && TRACE_STATUSES.has(value as TraceStatus)
    ? value as TraceStatus
    : null;
}

function traceRuntimeOf(value: unknown): TraceRuntime {
  return typeof value === 'string' && TRACE_RUNTIMES.has(value as TraceRuntime)
    ? value as TraceRuntime
    : 'backend';
}

function traceErrorOf(value: unknown): TraceError | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return { code: 'Error', message: value };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { code: 'Error', message: String(value) };
  }
  const record = value as JsonRecord;
  return {
    code: traceStringField(record, 'code', 'name') ?? 'Error',
    message: traceStringField(record, 'message', 'summary', 'error') ?? 'Unknown trace error',
  };
}

function tracePayloadFromBackendEvent(
  event: BackendEvent,
  base: { conversationRef: string; turnRef: string | null; eventId: string; timestamp: string },
): TraceEventPayload | null {
  const payload = payloadOf(event);
  const path = traceStringField(payload, 'path');
  const stage = traceStringField(payload, 'stage');
  const status = traceStatusOf(payload.status);
  if (!path || !stage || !status) {
    return null;
  }
  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? sanitizeTraceData(payload.data as JsonRecord)
    : undefined;
  return {
    schemaVersion: 1,
    traceId: traceStringField(payload, 'traceId') ?? createRuntimeId('trace'),
    spanId: traceStringField(payload, 'spanId') ?? createRuntimeId('span'),
    parentSpanId: traceStringField(payload, 'parentSpanId'),
    path,
    stage,
    status,
    runtime: traceRuntimeOf(payload.runtime),
    conversationRef: base.conversationRef,
    turnRef: base.turnRef,
    userId: (
      typeof event.user_id === 'string' && event.user_id.trim() ? event.user_id.trim() : null
    ),
    requestId: traceStringField(payload, 'requestId'),
    startedAt: traceStringField(payload, 'startedAt'),
    endedAt: traceStringField(payload, 'endedAt') ?? base.timestamp,
    durationMs: traceNumberField(payload, 'durationMs'),
    backendSequence: backendSequenceOf(event),
    backendEventId: typeof event.event_id === 'string' && event.event_id.trim() ? event.event_id.trim() : null,
    ...(data ? { data } : {}),
    error: traceErrorOf(payload.error),
  };
}

function logCompactionNormalization(
  event: BackendEvent,
  base: { conversationRef: string; revisionId: string; turnRef: string | null; eventId: string; timestamp: string },
  normalizedType: ConversationEvent['type'],
  payload: JsonRecord,
): void {
  if (!isCompactionStdoutEnabled()) {
    return;
  }
  const replacementHistoryEntries = Array.isArray(payload.replacement_history_entries)
    ? payload.replacement_history_entries
    : null;
  console.log('[Agent SDK][Compaction] backend event normalized', {
    backendEventType: event.type,
    normalizedEventType: normalizedType,
    conversationRef: base.conversationRef,
    turnRef: base.turnRef,
    revisionId: base.revisionId,
    eventId: base.eventId,
    backendEventId: typeof event.event_id === 'string' ? event.event_id : null,
    backendSequence: backendSequenceOf(event),
    generationId: stringField(payload, 'generation_id'),
    skippedReason: stringField(payload, 'skipped_reason'),
    replacementHistoryEntryCount: replacementHistoryEntries?.length ?? null,
    beforeTokens: numberField(payload, 'before_tokens'),
    afterTokens: numberField(payload, 'after_tokens'),
    removedMessages: numberField(payload, 'removed_messages'),
  });
}

function isCompactionStdoutEnabled(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.WINDIE_DEBUG_COMPACTION_STDOUT === '1';
}

function missingBackendIdentityEvent(
  event: BackendEvent,
  base: { conversationRef: string; revisionId: string; turnRef: string | null; eventId: string; timestamp: string },
): ConversationEvent {
  return createConversationEvent({
    ...base,
    type: 'runtime_error',
    source: 'sdk',
    payload: {
      error: 'Backend stream event missing event_id or sequence',
      reason: 'missing_backend_event_identity',
      sourceEventType: event.type,
      backendEventId: typeof event.event_id === 'string' ? event.event_id : null,
      backendSequence: backendSequenceOf(event),
      rawEvent: event as unknown as JsonRecord,
    },
  });
}

export type NormalizeBackendEventOptions = {
  fallbackRevisionId?: string;
  fallbackConversationRef?: string;
  fallbackTurnRef?: string;
};

export function normalizeBackendEventToConversationEvent(
  event: BackendEvent,
  options: NormalizeBackendEventOptions = {},
): ConversationEvent | null {
  const base = eventBase(
    event,
    options.fallbackRevisionId,
    options.fallbackConversationRef,
    options.fallbackTurnRef,
  );
  if (!base) {
    return null;
  }
  const payload = payloadOf(event);
  const backendMetadata = backendEventMetadata(event);
  if (event.type === 'error') {
    const message = typeof payload.message === 'string'
      ? payload.message
      : (typeof payload.content === 'string' ? payload.content : 'Backend error');
    return createConversationEvent({
      ...base,
      type: 'turn_error',
      source: 'backend',
      payload: {
        message,
        content: typeof payload.content === 'string' ? payload.content : message,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        ...backendMetadata,
      },
    });
  }
  if (typeof event.event_id !== 'string' || !event.event_id.trim() || backendSequenceOf(event) === null) {
    return missingBackendIdentityEvent(event, base);
  }
  if (event.type === 'trace-event') {
    const tracePayload = tracePayloadFromBackendEvent(event, base);
    if (!tracePayload) {
      return createConversationEvent({
        ...base,
        type: 'runtime_error',
        source: 'sdk',
        payload: {
          error: 'Backend trace event missing required path, stage, or status',
          reason: 'malformed_backend_trace_event',
          sourceEventType: event.type,
          ...backendMetadata,
        },
      });
    }
    return createConversationEvent<TraceEventPayload>({
      ...base,
      type: 'trace_event',
      source: 'backend',
      payload: tracePayload,
    });
  }
  if (event.type === 'query-accepted') {
    return createConversationEvent({
      ...base,
      type: 'turn_started',
      source: 'backend',
      payload: {
        status: typeof payload.status === 'string' ? payload.status : 'accepted',
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'llm-thought') {
    return createConversationEvent({
      ...base,
      type: 'reasoning_delta',
      source: 'backend',
      payload: {
        text: typeof payload.status === 'string'
          ? payload.status
          : (typeof payload.content === 'string' ? payload.content : ''),
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'streaming-response') {
    return createConversationEvent({
      ...base,
      type: 'assistant_delta',
      source: 'backend',
      payload: {
        text: typeof payload.text === 'string' ? payload.text : '',
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'streaming-complete') {
    return createConversationEvent({
      ...base,
      type: 'turn_completed',
      source: 'backend',
      payload: {
        finalResponse: typeof payload.final_response === 'string' ? payload.final_response : null,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        modelId: stringField(payload, 'model_id', 'modelId', 'selected_model_id'),
        modelProvider: stringField(payload, 'model_provider', 'modelProvider'),
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'local-user-message') {
    return createConversationEvent({
      ...base,
      type: 'user_message',
      source: 'backend',
      payload: {
        ...payload,
        text: typeof payload.text === 'string' ? payload.text : '',
        content: typeof payload.text === 'string' ? payload.text : '',
        screenshotRef: typeof payload.screenshot_ref === 'string' ? payload.screenshot_ref : null,
        screenshotUrl: typeof payload.screenshot_url === 'string' ? payload.screenshot_url : null,
        screenshotRefs: Array.isArray(payload.screenshot_refs) ? payload.screenshot_refs : [],
        attachmentFilenames: Array.isArray(payload.attachment_filenames) ? payload.attachment_filenames : [],
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        sourceEventType: 'local-user-message',
        structuredPayload: payload,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'system-prompt') {
    const toolSchemas = Array.isArray(payload.tool_schemas) ? payload.tool_schemas : [];
    return createConversationEvent({
      ...base,
      type: 'system_prompt',
      source: 'backend',
      payload: {
        ...payload,
        content: typeof payload.content === 'string' ? payload.content : '',
        toolSchemas,
        structuredPayload: payload,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'user-message-full') {
    return createConversationEvent({
      ...base,
      type: 'user_message_metadata',
      source: 'backend',
      payload: {
        ...payload,
        content: typeof payload.content === 'string' ? payload.content : '',
        metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
          ? payload.metadata
          : null,
        structuredPayload: payload,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'assistant-message-full') {
    const content = stringFromEventPayloadOrTopLevel(event, 'content');
    return createConversationEvent({
      ...base,
      type: 'assistant_message',
      source: 'backend',
      payload: {
        text: content ?? '',
        content: content ?? '',
        structuredPayload: payload,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'tool-schemas') {
    const toolSchemas = Array.isArray(payload.tool_schemas) ? payload.tool_schemas : [];
    return createConversationEvent({
      ...base,
      type: 'tool_schemas_metadata',
      source: 'backend',
      payload: {
        ...payload,
        toolSchemas,
        structuredPayload: payload,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'tool-call') {
    return createConversationEvent({
      ...base,
      type: 'tool_call',
      source: 'backend',
      payload: {
        toolName: typeof payload.tool_name === 'string' ? payload.tool_name : null,
        args: payload.parameters && typeof payload.parameters === 'object' ? payload.parameters : {},
        requestId: typeof payload.request_id === 'string' ? payload.request_id : null,
        correlationId: typeof payload.correlation_id === 'string' ? payload.correlation_id : null,
        metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
          ? payload.metadata
          : null,
        toolCallId: typeof payload.tool_call_id === 'string'
          ? payload.tool_call_id
          : resolveModelFacingToolCallId(payload),
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        structuredPayload: payload,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'web-search-progress') {
    return createConversationEvent({
      ...base,
      type: 'tool_progress',
      source: 'backend',
      payload: {
        ...payload,
        toolName: 'web_search',
        text: typeof payload.text === 'string' ? payload.text : '',
        requestId: typeof payload.request_id === 'string' ? payload.request_id : null,
        correlationId: toolCorrelationIdFromPayload(payload),
        structuredPayload: payload,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'tool-output') {
    return createConversationEvent({
      ...base,
      type: 'tool_output',
      source: 'backend',
      payload: {
        ...payload,
        toolName: typeof payload.tool_name === 'string' ? payload.tool_name : null,
        requestId: typeof payload.request_id === 'string' ? payload.request_id : null,
        correlationId: toolCorrelationIdFromPayload(payload),
        screenshotRef: typeof payload.screenshot_ref === 'string' ? payload.screenshot_ref : null,
        screenshot: typeof payload.screenshot === 'string' ? payload.screenshot : null,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        structuredPayload: payload,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'tool-bundle') {
    return createConversationEvent({
      ...base,
      type: 'tool_bundle_call',
      source: 'backend',
      payload: {
        bundleId: typeof payload.bundle_id === 'string' ? payload.bundle_id : null,
        correlationId: typeof payload.bundle_id === 'string' ? payload.bundle_id : null,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        tools: normalizeToolBundleTools(payload.tools),
        structuredPayload: payload,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'context-compaction-started') {
    logCompactionNormalization(event, base, 'compaction_started', payload);
    return createConversationEvent({
      ...base,
      type: 'compaction_started',
      source: 'backend',
      payload: {
        ...payload,
        operationRef: base.turnRef,
        compactionRef: stringField(payload, 'generation_id') ?? base.turnRef,
        reason: typeof payload.reason === 'string' ? payload.reason : null,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'context-compaction-completed') {
    const skippedReason = typeof payload.skipped_reason === 'string'
      ? payload.skipped_reason
      : '';
    const replacementHistoryEntries = Array.isArray(payload.replacement_history_entries)
      ? payload.replacement_history_entries
      : [];
    const hasReplacementHistory = replacementHistoryEntries.length > 0;
    const normalizedType = skippedReason || !hasReplacementHistory ? 'compaction_skipped' : 'compaction_applied';
    logCompactionNormalization(event, base, normalizedType, payload);
    return createConversationEvent({
      ...base,
      type: normalizedType,
      source: 'backend',
      payload: {
        ...payload,
        operationRef: base.turnRef,
        compactionRef: typeof payload.generation_id === 'string'
          ? payload.generation_id
          : base.turnRef,
        skippedReason: skippedReason || (hasReplacementHistory ? null : 'missing-replacement-history'),
        generationId: typeof payload.generation_id === 'string' ? payload.generation_id : null,
        reason: typeof payload.reason === 'string' ? payload.reason : null,
        strategy: typeof payload.strategy === 'string' ? payload.strategy : null,
        beforeTokens: typeof payload.before_tokens === 'number' ? payload.before_tokens : null,
        afterTokens: typeof payload.after_tokens === 'number' ? payload.after_tokens : null,
        removedMessages: typeof payload.removed_messages === 'number' ? payload.removed_messages : null,
        summaryPreview: typeof payload.summary_preview === 'string' ? payload.summary_preview : null,
        summaryText: typeof payload.summary_text === 'string' ? payload.summary_text : null,
        replacementHistoryPreview: Array.isArray(payload.replacement_history_preview)
          ? payload.replacement_history_preview
          : [],
        entries: replacementHistoryEntries,
        entryCount: replacementHistoryEntries.length,
        complete: hasReplacementHistory,
        active: hasReplacementHistory,
        sourceRevisionId: base.revisionId,
        sourceTurnRef: base.turnRef,
        createdAt: base.timestamp,
        replacementHistoryEntries,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'context-compaction-failed') {
    logCompactionNormalization(event, base, 'compaction_failed', payload);
    return createConversationEvent({
      ...base,
      type: 'compaction_failed',
      source: 'backend',
      payload: {
        ...payload,
        operationRef: base.turnRef,
        compactionRef: stringField(payload, 'generation_id') ?? base.turnRef,
        error: typeof payload.error === 'string' ? payload.error : null,
        ...backendMetadata,
      },
    });
  }
  if (event.type === 'token-count') {
    return createConversationEvent({
      ...base,
      type: 'usage_updated',
      source: 'backend',
      payload: {
        ...payload,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        ...backendMetadata,
      },
    });
  }
  return null;
}
