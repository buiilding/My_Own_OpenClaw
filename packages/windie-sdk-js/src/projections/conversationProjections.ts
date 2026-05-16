import type {
  CompactionState,
  ConversationEvent,
  ConversationMetadata,
  DisplayConversation,
  DisplayMessage,
  JsonRecord,
  RehydrateSnapshot,
  ToolTrace,
} from '../conversation/types.js';

function textFromPayload(payload: JsonRecord): string {
  if (typeof payload.text === 'string') {
    return payload.text;
  }
  if (typeof payload.content === 'string') {
    return payload.content;
  }
  if (typeof payload.finalResponse === 'string') {
    return payload.finalResponse;
  }
  if (typeof payload.final_response === 'string') {
    return payload.final_response;
  }
  if (typeof payload.error === 'string') {
    return payload.error;
  }
  return '';
}

function contentFromPayload(payload: JsonRecord): string {
  const text = textFromPayload(payload);
  if (text) {
    return text;
  }
  const structured = payload.structuredPayload;
  if (structured && typeof structured === 'object') {
    return JSON.stringify(structured);
  }
  return JSON.stringify(payload);
}

function toolNameFromPayload(payload: JsonRecord): string | null {
  if (typeof payload.toolName === 'string') {
    return payload.toolName;
  }
  if (typeof payload.tool_name === 'string') {
    return payload.tool_name;
  }
  return null;
}

function stringField(payload: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function toolOutputDedupeKey(event: ConversationEvent): string | null {
  if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
    return null;
  }
  const requestId = stringField(event.payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
  if (requestId) {
    return `request:${requestId}`;
  }
  const bundleId = stringField(event.payload, 'bundleId', 'bundle_id');
  if (bundleId) {
    return `bundle:${bundleId}`;
  }
  const toolCallId = stringField(event.payload, 'toolCallId', 'tool_call_id');
  return toolCallId ? `tool-call:${toolCallId}` : null;
}

function recordFromUnknown(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function toolCallsFromPayload(payload: JsonRecord): unknown[] | null {
  if (Array.isArray(payload.toolCalls)) {
    return payload.toolCalls;
  }
  if (Array.isArray(payload.tool_calls)) {
    return payload.tool_calls;
  }
  const structuredPayload = recordFromUnknown(payload.structuredPayload);
  if (Array.isArray(structuredPayload?.toolCalls)) {
    return structuredPayload.toolCalls;
  }
  if (Array.isArray(structuredPayload?.tool_calls)) {
    return structuredPayload.tool_calls;
  }
  const tools = Array.isArray(payload.tools)
    ? payload.tools
    : (Array.isArray(structuredPayload?.tools) ? structuredPayload.tools : null);
  if (!tools) {
    return null;
  }
  const toolCalls = tools
    .map(tool => {
      const record = recordFromUnknown(tool);
      const metadata = recordFromUnknown(record?.metadata);
      return recordFromUnknown(metadata?.model_facing_tool_call)
        ?? recordFromUnknown(record?.model_facing_tool_call);
    })
    .filter((toolCall): toolCall is JsonRecord => Boolean(toolCall));
  return toolCalls.length > 0 ? toolCalls : null;
}

function withoutDuplicateToolOutputs(events: ConversationEvent[]): ConversationEvent[] {
  const seenOutputs = new Set<string>();
  return events.filter(event => {
    const key = toolOutputDedupeKey(event);
    if (!key) {
      return true;
    }
    if (seenOutputs.has(key)) {
      return false;
    }
    seenOutputs.add(key);
    return true;
  });
}

function toDisplayMessage(event: ConversationEvent): DisplayMessage | null {
  if (event.type === 'assistant_delta') {
    return null;
  }
  if (event.type === 'compaction_skipped') {
    return null;
  }
  if (event.type.startsWith('compaction_')) {
    return null;
  }
  let sender: DisplayMessage['sender'] = 'system';
  if (event.type === 'user_message') {
    sender = 'user';
  } else if (event.type === 'assistant_message') {
    sender = 'assistant';
  } else if (
    event.type === 'tool_call'
    || event.type === 'tool_output'
    || event.type === 'tool_bundle_call'
    || event.type === 'tool_bundle_output'
  ) {
    sender = 'tool';
  }
  const text = textFromPayload(event.payload);
  if (!text && sender === 'system') {
    return null;
  }
  return {
    id: event.eventId,
    conversationRef: event.conversationRef,
    turnRef: event.turnRef,
    revisionId: event.revisionId,
    timestamp: event.timestamp,
    sender,
    text,
    messageType: event.type,
    toolName: toolNameFromPayload(event.payload),
    requestId: stringField(event.payload, 'requestId', 'request_id'),
    bundleId: stringField(event.payload, 'bundleId', 'bundle_id'),
    toolCallId: stringField(event.payload, 'toolCallId', 'tool_call_id'),
    correlationId: stringField(event.payload, 'correlationId', 'correlation_id'),
    metadata: event.payload,
  };
}

export function buildCompactionState(events: ConversationEvent[]): CompactionState {
  const compactionEvent = [...events].reverse().find(event => event.type.startsWith('compaction_'));
  if (!compactionEvent) {
    return { status: 'idle' };
  }
  if (compactionEvent.type === 'compaction_started') {
    return { status: 'started', debug: compactionEvent.payload };
  }
  if (compactionEvent.type === 'compaction_skipped') {
    return {
      status: 'skipped',
      skippedReason: stringField(compactionEvent.payload, 'skippedReason', 'skipped_reason'),
      debug: compactionEvent.payload,
    };
  }
  if (compactionEvent.type === 'compaction_applied') {
    return {
      status: 'applied',
      generationId: stringField(compactionEvent.payload, 'generationId', 'generation_id'),
      summaryPreview: stringField(compactionEvent.payload, 'summaryPreview', 'summary_preview'),
      debug: compactionEvent.payload,
    };
  }
  if (compactionEvent.type === 'compaction_failed') {
    return { status: 'failed', debug: compactionEvent.payload };
  }
  return { status: 'idle' };
}

export function buildDisplayConversation(events: ConversationEvent[]): DisplayConversation {
  const first = events[0];
  const last = events[events.length - 1];
  const displayEvents = withoutDuplicateToolOutputs(events);
  return {
    conversationRef: first?.conversationRef ?? '',
    revisionId: last?.revisionId ?? first?.revisionId ?? '',
    messages: displayEvents.map(toDisplayMessage).filter((message): message is DisplayMessage => Boolean(message)),
    compaction: buildCompactionState(events),
  };
}

export function buildToolTrace(events: ConversationEvent[]): ToolTrace {
  const display = buildDisplayConversation(events);
  return {
    conversationRef: display.conversationRef,
    revisionId: display.revisionId,
    calls: display.messages.filter(message => (
      message.messageType === 'tool_call' || message.messageType === 'tool_bundle_call'
    )),
    outputs: display.messages.filter(message => (
      message.messageType === 'tool_output' || message.messageType === 'tool_bundle_output'
    )),
  };
}

export function buildConversationMetadata(events: ConversationEvent[]): ConversationMetadata {
  const display = buildDisplayConversation(events);
  const lastMessage = [...display.messages].reverse().find(message => message.text);
  const firstUserMessage = display.messages.find(message => message.sender === 'user');
  return {
    conversationRef: display.conversationRef,
    revisionId: display.revisionId,
    title: firstUserMessage?.text ?? display.conversationRef,
    lastMessage: lastMessage?.text ?? null,
    updatedAt: events[events.length - 1]?.timestamp ?? new Date(0).toISOString(),
    eventCount: events.length,
  };
}

function toRehydrateMessage(event: ConversationEvent): JsonRecord | null {
  if (event.type === 'user_message') {
    return {
      role: 'user',
      content: textFromPayload(event.payload),
      ...((event.payload.structuredPayload as JsonRecord | undefined) ?? {}),
    };
  }
  if (event.type === 'assistant_message') {
    return {
      role: 'assistant',
      content: textFromPayload(event.payload),
      ...((event.payload.structuredPayload as JsonRecord | undefined) ?? {}),
    };
  }
  if (event.type === 'tool_call') {
    return {
      role: 'assistant',
      content: textFromPayload(event.payload),
      tool_calls: toolCallsFromPayload(event.payload),
      tool_call_id: stringField(event.payload, 'toolCallId', 'tool_call_id'),
      ...((event.payload.structuredPayload as JsonRecord | undefined) ?? {}),
    };
  }
  if (event.type === 'tool_bundle_call') {
    return {
      role: 'assistant',
      content: contentFromPayload(event.payload),
      message_type: 'tool-bundle',
      bundle_id: stringField(event.payload, 'bundleId', 'bundle_id'),
      tools: event.payload.tools,
      tool_calls: toolCallsFromPayload(event.payload),
      ...((event.payload.structuredPayload as JsonRecord | undefined) ?? {}),
    };
  }
  if (event.type === 'tool_output') {
    return {
      role: 'tool',
      content: textFromPayload(event.payload),
      tool_call_id: stringField(event.payload, 'toolCallId', 'tool_call_id'),
      name: toolNameFromPayload(event.payload),
      ...((event.payload.structuredPayload as JsonRecord | undefined) ?? {}),
    };
  }
  if (event.type === 'tool_bundle_output') {
    return {
      role: 'tool',
      content: contentFromPayload(event.payload),
      message_type: 'tool-bundle-result',
      bundle_id: stringField(event.payload, 'bundleId', 'bundle_id'),
      name: 'tool_bundle',
      ...((event.payload.structuredPayload as JsonRecord | undefined) ?? {}),
    };
  }
  return null;
}

export function buildRehydrateSnapshot(events: ConversationEvent[]): RehydrateSnapshot {
  const display = buildDisplayConversation(events);
  const rehydrateEvents = withoutDuplicateToolOutputs(events);
  return {
    conversationRef: display.conversationRef,
    revisionId: display.revisionId,
    messages: rehydrateEvents.map(toRehydrateMessage).filter((message): message is JsonRecord => Boolean(message)),
    replayGenerationId: null,
  };
}
