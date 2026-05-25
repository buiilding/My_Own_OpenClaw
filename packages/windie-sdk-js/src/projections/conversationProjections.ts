import type {
  CompactionState,
  ConversationEvent,
  ConversationMetadata,
  CurrentTurnProjection,
  CurrentTurnProjectionPhase,
  CurrentTurnToolEvent,
  DisplayConversation,
  DisplayMessage,
  JsonRecord,
  RehydrateSnapshot,
  ToolTrace,
} from '../conversation/types.js';
import {
  resolveToolOutputDedupeKey,
  resolveToolPairKeys,
} from '../tools/toolCorrelationIds.js';
import {
  readBundleStepModelContent,
  readToolOutputContent,
  recordFromUnknown,
  stringField,
} from '../tools/toolOutputContent.js';

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

function displayTextFromPayload(payload: JsonRecord): string {
  return readToolOutputContent(payload).displayContent;
}

function modelTextFromPayload(payload: JsonRecord): string {
  return readToolOutputContent(payload).modelContent;
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

function statusFromToolPayload(payload: JsonRecord): string | null {
  if (typeof payload.status === 'string') {
    return payload.status;
  }
  if (typeof payload.success === 'boolean') {
    return payload.success ? 'success' : 'error';
  }
  if (typeof payload.error === 'string' && payload.error.length > 0) {
    return 'error';
  }
  return null;
}

function currentTurnToolEventFrom(event: ConversationEvent): CurrentTurnToolEvent | null {
  if (event.type !== 'tool_call'
    && event.type !== 'tool_bundle_call'
    && event.type !== 'tool_progress'
    && event.type !== 'tool_output'
    && event.type !== 'tool_bundle_output') {
    return null;
  }
  const kind = event.type === 'tool_progress'
    ? 'tool_progress'
    : (event.type === 'tool_output' || event.type === 'tool_bundle_output' ? 'tool_output' : 'tool_call');
  const toolName = toolNameFromPayload(event.payload)
    ?? (event.type === 'tool_bundle_call' || event.type === 'tool_bundle_output' ? 'tool_bundle' : null);
  const outputText = event.type === 'tool_output' || event.type === 'tool_bundle_output'
    ? displayTextFromPayload(event.payload)
    : textFromPayload(event.payload);
  return {
    id: event.eventId,
    kind,
    toolName,
    ...(outputText ? { text: outputText } : {}),
    status: statusFromToolPayload(event.payload),
    payload: event.payload,
  };
}

function emptyCurrentTurnProjection(
  conversationRef: string,
  turnRef: string | null = null,
): CurrentTurnProjection {
  return {
    conversationRef,
    turnRef,
    phase: turnRef ? 'awaiting' : 'idle',
    assistantText: '',
    reasoningText: null,
    toolEvents: [],
    lastError: null,
  };
}

function resetCurrentTurnIfNeeded(
  current: CurrentTurnProjection,
  event: ConversationEvent,
): CurrentTurnProjection {
  if (!event.turnRef || current.turnRef === event.turnRef) {
    return current;
  }
  return emptyCurrentTurnProjection(event.conversationRef, event.turnRef);
}

function appendText(current: string, next: string): string {
  if (!next) {
    return current;
  }
  return `${current}${next}`;
}

function appendNullableText(current: string | null, next: string): string | null {
  if (!next) {
    return current;
  }
  return `${current ?? ''}${next}`;
}

function advanceCurrentTurnPhase(
  current: CurrentTurnProjection,
  phase: CurrentTurnProjectionPhase,
): CurrentTurnProjection {
  if (current.phase === phase) {
    return current;
  }
  return { ...current, phase };
}

export function buildCurrentTurnProjection(events: ConversationEvent[]): CurrentTurnProjection {
  let projection = emptyCurrentTurnProjection(events[0]?.conversationRef ?? '');
  for (const event of events) {
    projection = resetCurrentTurnIfNeeded(projection, event);
    if (!projection.conversationRef) {
      projection = { ...projection, conversationRef: event.conversationRef };
    }
    if (!projection.turnRef && event.turnRef) {
      projection = { ...projection, turnRef: event.turnRef };
    }

    if (event.type === 'turn_started' || event.type === 'user_message') {
      projection = advanceCurrentTurnPhase(projection, 'awaiting');
      continue;
    }
    if (event.type === 'reasoning_delta') {
      projection = {
        ...advanceCurrentTurnPhase(projection, projection.phase === 'idle' ? 'awaiting' : projection.phase),
        reasoningText: appendNullableText(projection.reasoningText, textFromPayload(event.payload)),
      };
      continue;
    }
    if (event.type === 'assistant_delta') {
      projection = {
        ...projection,
        phase: 'streaming',
        assistantText: appendText(projection.assistantText, textFromPayload(event.payload)),
      };
      continue;
    }
    if (event.type === 'assistant_message') {
      const text = textFromPayload(event.payload);
      projection = {
        ...projection,
        phase: text ? 'streaming' : projection.phase,
        assistantText: text || projection.assistantText,
      };
      continue;
    }
    const toolEvent = currentTurnToolEventFrom(event);
    if (toolEvent) {
      projection = {
        ...projection,
        phase: toolEvent.kind === 'tool_output' ? 'tool_output' : 'tool_call',
        toolEvents: [...projection.toolEvents, toolEvent],
      };
      continue;
    }
    if (event.type === 'turn_completed') {
      const finalResponse = textFromPayload(event.payload);
      projection = {
        ...projection,
        phase: 'complete',
        assistantText: projection.assistantText || finalResponse,
        lastError: null,
      };
      continue;
    }
    if (event.type === 'turn_error' || event.type === 'runtime_error' || event.type === 'compaction_failed') {
      projection = {
        ...projection,
        phase: 'error',
        lastError: textFromPayload(event.payload) || 'Unknown runtime error',
      };
    }
  }
  return projection;
}

function toolOutputDedupeKey(event: ConversationEvent): string | null {
  if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
    return null;
  }
  return resolveToolOutputDedupeKey(event.payload);
}

function toolPairKey(event: ConversationEvent): string | null {
  return toolPairKeys(event)[0] ?? null;
}

function toolPairKeys(event: ConversationEvent): string[] {
  if (event.type === 'tool_bundle_call' || event.type === 'tool_bundle_output') {
    return resolveToolPairKeys(event.payload, { bundle: true });
  }
  if (event.type === 'tool_call' || event.type === 'tool_output') {
    return resolveToolPairKeys(event.payload);
  }
  return [];
}

function isToolCallEvent(event: ConversationEvent): boolean {
  return event.type === 'tool_call' || event.type === 'tool_bundle_call';
}

function isToolOutputEvent(event: ConversationEvent): boolean {
  return event.type === 'tool_output' || event.type === 'tool_bundle_output';
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

function structuredPayloadFrom(payload: JsonRecord): JsonRecord | null {
  const structuredPayload = recordFromUnknown(payload.structuredPayload);
  return structuredPayload ? { ...structuredPayload } : null;
}

function withStructuredPayload(message: JsonRecord, payload: JsonRecord): JsonRecord {
  const structuredPayload = structuredPayloadFrom(payload);
  if (!structuredPayload) {
    return message;
  }
  return {
    ...message,
    structured_payload: structuredPayload,
  };
}

function stepOutputContent(step: JsonRecord): string {
  const output = step.output ?? step.result;
  if (typeof output === 'string') {
    return output;
  }
  const outputRecord = recordFromUnknown(output);
  if (outputRecord) {
    return readBundleStepModelContent({ output: outputRecord });
  }
  return JSON.stringify(step);
}

function bundleStepResultsFromPayload(payload: JsonRecord): JsonRecord[] {
  const structuredPayload = structuredPayloadFrom(payload);
  const candidates = [
    payload.stepResults,
    payload.step_results,
    structuredPayload?.stepResults,
    structuredPayload?.step_results,
    structuredPayload?.results,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    return candidate
      .map(step => recordFromUnknown(step))
      .filter((step): step is JsonRecord => Boolean(step));
  }
  return [];
}

function bundleOutputMessages(event: ConversationEvent): JsonRecord[] {
  const bundleId = stringField(event.payload, 'bundleId', 'bundle_id');
  const structuredPayload = structuredPayloadFrom(event.payload);
  const steps = bundleStepResultsFromPayload(event.payload);
  if (steps.length === 0) {
    return [withStructuredPayload({
      role: 'tool',
      content: contentFromPayload(event.payload),
      tool_name: 'tool_bundle',
    }, {
      structuredPayload: {
        ...(structuredPayload ?? {}),
        ...(bundleId ? { bundle_id: bundleId } : {}),
      },
    })];
  }
  return steps.map(step => {
    const toolCallId = stringField(step, 'toolCallId', 'tool_call_id', 'id');
    const toolName = stringField(step, 'toolName', 'tool_name', 'tool') ?? 'tool_bundle';
    return withStructuredPayload({
      role: 'tool',
      content: stepOutputContent(step),
      tool_call_id: toolCallId,
      tool_name: toolName,
    }, {
      structuredPayload: {
        ...(structuredPayload ?? {}),
        ...(bundleId ? { bundle_id: bundleId } : {}),
        step_result: step,
      },
    });
  });
}

function withoutDuplicateToolOutputs(events: ConversationEvent[]): ConversationEvent[] {
  const preferredOutputs = new Map<string, ConversationEvent>();
  const prefers = (candidate: ConversationEvent, current: ConversationEvent): boolean => {
    const candidateHasModelContent = readToolOutputContent(candidate.payload).hasModelContent;
    const currentHasModelContent = readToolOutputContent(current.payload).hasModelContent;
    if (candidate.source === 'backend' && current.source !== 'backend') {
      return true;
    }
    if (candidate.source !== 'backend' && current.source === 'backend') {
      return false;
    }
    if (candidateHasModelContent !== currentHasModelContent) {
      return candidateHasModelContent;
    }
    return false;
  };
  for (const event of events) {
    const key = toolOutputDedupeKey(event);
    if (!key) {
      continue;
    }
    const current = preferredOutputs.get(key);
    if (!current || prefers(event, current)) {
      preferredOutputs.set(key, event);
    }
  }
  return events.filter(event => {
    const key = toolOutputDedupeKey(event);
    if (!key) {
      return true;
    }
    return preferredOutputs.get(key) === event;
  });
}

function withoutDanglingToolPairs(events: ConversationEvent[]): ConversationEvent[] {
  const callKeys = new Set<string>();
  const outputKeys = new Set<string>();
  for (const event of events) {
    const keys = toolPairKeys(event);
    if (keys.length === 0) {
      continue;
    }
    if (isToolCallEvent(event)) {
      keys.forEach(key => callKeys.add(key));
    } else if (isToolOutputEvent(event)) {
      keys.forEach(key => outputKeys.add(key));
    }
  }
  return events.filter(event => {
    if (isToolCallEvent(event)) {
      return toolPairKeys(event).some(key => outputKeys.has(key));
    }
    if (isToolOutputEvent(event)) {
      return toolPairKeys(event).some(key => callKeys.has(key));
    }
    return true;
  });
}

function toDisplayMessage(event: ConversationEvent): DisplayMessage | null {
  if (event.type === 'assistant_delta') {
    return null;
  }
  if (event.type === 'reasoning_delta') {
    return null;
  }
  if (event.type === 'tool_progress') {
    return null;
  }
  if (event.type === 'turn_completed') {
    return null;
  }
  if (
    event.type === 'system_prompt'
    || event.type === 'user_message_metadata'
    || event.type === 'tool_schemas_metadata'
  ) {
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
  const text = (
    event.type === 'tool_output' || event.type === 'tool_bundle_output'
      ? displayTextFromPayload(event.payload)
      : textFromPayload(event.payload)
  );
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

function toRehydrateMessages(event: ConversationEvent): JsonRecord[] {
  if (event.type === 'user_message') {
    return [withStructuredPayload({
      role: 'user',
      content: textFromPayload(event.payload),
    }, event.payload)];
  }
  if (event.type === 'assistant_message') {
    return [withStructuredPayload({
      role: 'assistant',
      content: textFromPayload(event.payload),
    }, event.payload)];
  }
  if (event.type === 'tool_call') {
    return [withStructuredPayload({
      role: 'assistant',
      content: textFromPayload(event.payload),
      tool_calls: toolCallsFromPayload(event.payload),
      tool_call_id: stringField(event.payload, 'toolCallId', 'tool_call_id'),
    }, event.payload)];
  }
  if (event.type === 'tool_bundle_call') {
    return [withStructuredPayload({
      role: 'assistant',
      content: contentFromPayload(event.payload),
      tool_calls: toolCallsFromPayload(event.payload),
    }, {
      structuredPayload: {
        ...(structuredPayloadFrom(event.payload) ?? {}),
        bundle_id: stringField(event.payload, 'bundleId', 'bundle_id'),
        tools: event.payload.tools,
      },
    })];
  }
  if (event.type === 'tool_output') {
    return [withStructuredPayload({
      role: 'tool',
      content: modelTextFromPayload(event.payload),
      tool_call_id: stringField(event.payload, 'toolCallId', 'tool_call_id'),
      tool_name: toolNameFromPayload(event.payload),
    }, event.payload)];
  }
  if (event.type === 'tool_bundle_output') {
    return bundleOutputMessages(event);
  }
  return [];
}

export function buildRehydrateSnapshot(events: ConversationEvent[]): RehydrateSnapshot {
  const display = buildDisplayConversation(events);
  const rehydrateEvents = withoutDanglingToolPairs(withoutDuplicateToolOutputs(events));
  return {
    conversationRef: display.conversationRef,
    revisionId: display.revisionId,
    messages: rehydrateEvents.flatMap(toRehydrateMessages),
    replayGenerationId: null,
  };
}
