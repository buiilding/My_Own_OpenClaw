/**
 * Projects conversation projections state for the TypeScript SDK runtime.
 */

import type {
  CompactionState,
  ConversationEvent,
  ConversationMetadata,
  ConversationView,
  ConversationViewBuildDiagnostics,
  ConversationViewBuildInput,
  ConversationViewLiveTurnPhase,
  CurrentTurnProjection,
  CurrentTurnProjectionPhase,
  CurrentTurnToolEvent,
  DisplayConversation,
  DisplayMessage,
  JsonRecord,
  LiveTurnPresentation,
  LiveTurnPresentationEntry,
  RehydrateSnapshot,
  SdkDisplayAttachment,
  SdkDisplayRow,
  SdkDisplayRowMetadata,
  TraceEventPayload,
  TraceTimelineEntry,
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
import { legacyVisualAttachmentReplayAdapter } from './legacyVisualAttachmentReplayAdapter.js';

function textFromPayload(payload: JsonRecord): string {
  if (typeof payload.text === 'string') {
    return payload.text;
  }
  if (typeof payload.message === 'string') {
    return payload.message;
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

function isConversationControlProjectionEvent(event: ConversationEvent): boolean {
  return event.type === 'compaction_started'
    || event.type === 'compaction_skipped'
    || event.type === 'compaction_applied'
    || event.type === 'compaction_failed';
}

function isTracePayload(payload: JsonRecord): payload is TraceEventPayload {
  return payload.schemaVersion === 1
    && typeof payload.traceId === 'string'
    && typeof payload.spanId === 'string'
    && typeof payload.path === 'string'
    && typeof payload.stage === 'string'
    && typeof payload.status === 'string'
    && typeof payload.runtime === 'string';
}

const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';
const EMPTY_CHAT_GREETING_TEXT = 'Hi! What can I help you with?';
const SDK_CURRENT_TURN_SOURCE_CHANNEL = 'sdk:current-turn';
const RECOVERABLE_TOOL_PARSE_ERROR_MARKERS = [
  'failed to parse streamed tool-call arguments',
  'raw arguments preview:',
];

function shouldIgnoreCurrentTurnError(payload: JsonRecord): boolean {
  const message = typeof payload.message === 'string' ? payload.message : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  const normalizedMessage = message.toLowerCase();
  const normalizedContent = content.toLowerCase();
  const isRecoverableToolParseError = RECOVERABLE_TOOL_PARSE_ERROR_MARKERS.every((marker) => (
    normalizedMessage.includes(marker) || normalizedContent.includes(marker)
  ));
  return (
    message.includes(SETTINGS_UPDATE_ERROR_TEXT)
    || content.includes(SETTINGS_UPDATE_ERROR_TEXT)
    || isRecoverableToolParseError
  );
}

function displayTextFromPayload(payload: JsonRecord): string {
  return readToolOutputContent(payload).displayContent;
}

function rawToolOutputTextFromPayload(payload: JsonRecord): string {
  const result = recordFromUnknown(payload.result);
  return stringField(result, 'output')
    ?? stringField(payload, 'output')
    ?? stringField(result, 'message')
    ?? stringField(payload, 'message')
    ?? stringField(result, 'error')
    ?? stringField(payload, 'error')
    ?? JSON.stringify(payload);
}

function bundleOutputContentFromPayload(payload: JsonRecord): JsonRecord {
  const bundleId = stringField(payload, 'bundleId', 'bundle_id');
  const steps = bundleStepResultsFromPayload(payload);
  if (steps.length === 0) {
    return {
      ...(bundleId ? { bundleId } : {}),
      step_results: [],
      output: rawToolOutputTextFromPayload(payload),
    };
  }
  return {
    ...(bundleId ? { bundleId } : {}),
    step_results: steps.map((step) => {
      const toolName = stringField(step, 'toolName', 'tool_name', 'tool');
      const toolCallId = stringField(step, 'toolCallId', 'tool_call_id', 'id');
      const status = stringField(step, 'status');
      const error = stringField(step, 'error');
      const rawOutput = recordFromUnknown(step.output) ?? recordFromUnknown(step.result);
      return {
        ...(toolName ? { tool: toolName } : {}),
        ...(toolCallId ? { toolCallId } : {}),
        ...(status ? { status } : {}),
        output: rawOutput
          ? rawToolOutputTextFromPayload(rawOutput)
          : (
            stringField(step, 'output', 'result', 'message')
            ?? (error ? `Error: ${error}` : JSON.stringify(step))
          ),
      };
    }),
  };
}

function bundleDisplayTextFromPayload(payload: JsonRecord): string {
  const content = bundleOutputContentFromPayload(payload);
  const steps = Array.isArray(content.step_results) ? content.step_results : [];
  if (steps.length === 0) {
    return typeof content.output === 'string' ? content.output : displayTextFromPayload(payload);
  }
  return steps.map((step, index) => {
    const stepRecord = recordFromUnknown(step);
    const toolName = stringField(stepRecord, 'tool');
    const label = toolName ? `${toolName} #${index + 1}` : `step #${index + 1}`;
    const outputRecord = recordFromUnknown(stepRecord?.output) ?? recordFromUnknown(stepRecord?.result);
    const outputText = stringField(stepRecord, 'output')
      ?? (outputRecord ? readToolOutputContent(outputRecord).displayContent : readBundleStepModelContent(stepRecord ?? {}));
    return `${label}\n${outputText}`;
  }).join('\n\n');
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

function modelFacingToolCallFromRecord(record: JsonRecord | null): JsonRecord | null {
  const metadata = recordFromUnknown(record?.metadata);
  const modelFacing = recordFromUnknown(metadata?.model_facing_tool_call)
    ?? recordFromUnknown(record?.model_facing_tool_call);
  if (modelFacing) {
    return modelFacing;
  }
  const toolCalls = Array.isArray(record?.tool_calls)
    ? record?.tool_calls
    : (Array.isArray(record?.toolCalls) ? record?.toolCalls : null);
  if (toolCalls) {
    const first = recordFromUnknown(toolCalls[0]);
    if (first) {
      return first;
    }
  }
  const toolName = stringField(record, 'toolName', 'tool_name', 'name');
  if (!toolName) {
    return null;
  }
  const args = recordFromUnknown(record?.args)
    ?? recordFromUnknown(record?.parameters)
    ?? recordFromUnknown(record?.arguments)
    ?? {};
  const toolCallId = stringField(record, 'toolCallId', 'tool_call_id', 'id');
  return {
    ...(toolCallId ? { id: toolCallId } : {}),
    name: toolName,
    arguments: args,
  };
}

function modelFacingToolCallFromPayload(payload: JsonRecord): JsonRecord {
  const structuredPayload = recordFromUnknown(payload.structuredPayload);
  return modelFacingToolCallFromRecord(payload)
    ?? modelFacingToolCallFromRecord(structuredPayload)
    ?? {
      name: toolNameFromPayload(payload) ?? 'tool',
      arguments: recordFromUnknown(payload.args) ?? {},
    };
}

function bundleToolCallContentFromPayload(payload: JsonRecord): JsonRecord {
  const bundleId = stringField(payload, 'bundleId', 'bundle_id');
  const structuredPayload = recordFromUnknown(payload.structuredPayload);
  const tools = Array.isArray(payload.tools)
    ? payload.tools
    : (Array.isArray(structuredPayload?.tools) ? structuredPayload.tools : []);
  const toolCalls = tools
    .map((tool) => modelFacingToolCallFromRecord(recordFromUnknown(tool)))
    .filter((toolCall): toolCall is JsonRecord => Boolean(toolCall));
  if (toolCalls.length > 0) {
    return {
      ...(bundleId ? { bundleId } : {}),
      tool_calls: toolCalls,
    };
  }
  return {
    ...(bundleId ? { bundleId } : {}),
    tool_calls: toolCallsFromPayload(payload) ?? [],
  };
}

function stringArrayField(record: JsonRecord, ...keys: string[]): string[] | null {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const normalized = value
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .map(entry => entry.trim());
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

function displayAttachmentFromRecord(record: JsonRecord): SdkDisplayAttachment | null {
  const id = stringField(record, 'id');
  const kind = record.kind === 'image' || record.kind === 'screenshot_request' ? record.kind : null;
  const source = (
    record.source === 'user_included'
    || record.source === 'camera_button'
    || record.source === 'tool_result'
    || record.source === 'replay'
  ) ? record.source : null;
  const status = (
    record.status === 'materializing'
    || record.status === 'pending_capture'
    || record.status === 'ready'
    || record.status === 'failed'
  ) ? record.status : null;
  if (!id || !kind || !source || !status) {
    return null;
  }
  return {
    id,
    kind,
    source,
    status,
    ...(stringField(record, 'filename') ? { filename: stringField(record, 'filename') } : {}),
    ...(stringField(record, 'contentType', 'content_type') ? {
      contentType: stringField(record, 'contentType', 'content_type'),
    } : {}),
    ...(stringField(record, 'screenshotRef', 'screenshot_ref') ? {
      screenshotRef: stringField(record, 'screenshotRef', 'screenshot_ref'),
    } : {}),
    ...(stringField(record, 'screenshotUrl', 'screenshot_url') ? {
      screenshotUrl: stringField(record, 'screenshotUrl', 'screenshot_url'),
    } : {}),
    ...(stringField(record, 'errorCode', 'error_code') ? { errorCode: stringField(record, 'errorCode', 'error_code') } : {}),
  };
}

function displayAttachmentsField(record: JsonRecord, ...keys: string[]): SdkDisplayAttachment[] | null {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const attachments = value
      .map(entry => recordFromUnknown(entry))
      .filter((entry): entry is JsonRecord => Boolean(entry))
      .map(displayAttachmentFromRecord)
      .filter((entry): entry is SdkDisplayAttachment => Boolean(entry));
    if (attachments.length > 0) {
      return attachments;
    }
  }
  return null;
}

function mergeDisplayAttachments(
  existing?: SdkDisplayAttachment[] | null,
  incoming?: SdkDisplayAttachment[] | null,
): SdkDisplayAttachment[] | null {
  const ordered = new Map<string, SdkDisplayAttachment>();
  for (const attachment of [...(existing ?? []), ...(incoming ?? [])]) {
    const previous = ordered.get(attachment.id);
    ordered.set(
      attachment.id,
      attachment.status === 'ready' || attachment.status === 'failed'
        ? attachment
        : {
          ...(previous ?? {}),
          ...attachment,
        },
    );
  }
  const attachments = Array.from(ordered.values());
  return attachments.length > 0 ? attachments : null;
}

function sourceEventTypeFromPayload(payload: JsonRecord): string | null {
  return stringField(payload, 'sourceEventType', 'source_event_type');
}

function displayCorrelationIdFromEvent(event: ConversationEvent): string | null {
  return stringField(
    event.payload,
    'requestId',
    'request_id',
    'bundleId',
    'bundle_id',
    'toolCallId',
    'tool_call_id',
    'correlationId',
    'correlation_id',
  );
}

function toolDisplayDetailsFromEvent(event: ConversationEvent): JsonRecord | null {
  if (event.type !== 'tool_call'
    && event.type !== 'tool_bundle_call'
    && event.type !== 'tool_output'
    && event.type !== 'tool_bundle_output') {
    return null;
  }
  const details: JsonRecord = {};
  const toolName = toolNameFromPayload(event.payload)
    ?? (event.type === 'tool_bundle_call' || event.type === 'tool_bundle_output' ? 'tool_bundle' : null);
  const requestId = stringField(event.payload, 'requestId', 'request_id');
  const correlationId = stringField(event.payload, 'correlationId', 'correlation_id');
  const displayCorrelationId = displayCorrelationIdFromEvent(event);
  const bundleId = stringField(event.payload, 'bundleId', 'bundle_id');
  const toolCallId = stringField(event.payload, 'toolCallId', 'tool_call_id');
  const sourceEventType = sourceEventTypeFromPayload(event.payload);
  if (toolName) {
    details.toolName = toolName;
  }
  if (requestId) {
    details.requestId = requestId;
  }
  if (correlationId) {
    details.correlationId = correlationId;
  }
  if (displayCorrelationId) {
    details.displayCorrelationId = displayCorrelationId;
  }
  if (bundleId) {
    details.bundleId = bundleId;
  }
  if (toolCallId) {
    details.toolCallId = toolCallId;
  }
  if (sourceEventType) {
    details.sourceEventType = sourceEventType;
  }
  if (typeof event.payload.success === 'boolean') {
    details.success = event.payload.success;
  }
  return Object.keys(details).length > 0 ? details : null;
}

function displayRowMetadata(event: ConversationEvent): SdkDisplayRowMetadata {
  const screenshotRef = stringField(event.payload, 'screenshotRef', 'screenshot_ref');
  const screenshotUrl = stringField(event.payload, 'screenshotUrl', 'screenshot_url');
  const screenshotRefs = stringArrayField(event.payload, 'screenshotRefs', 'screenshot_refs')
    ?? (screenshotRef ? [screenshotRef] : null);
  const attachments = displayAttachmentsField(event.payload, 'attachments', 'display_attachments')
    ?? legacyVisualAttachmentReplayAdapter(event);
  const screenshotContentType = stringField(event.payload, 'screenshotContentType', 'screenshot_content_type');
  const toolDetails = toolDisplayDetailsFromEvent(event);
  return {
    eventId: event.eventId,
    source: event.source,
    revisionId: event.revisionId,
    timestamp: event.timestamp,
    toolName: toolNameFromPayload(event.payload),
    requestId: stringField(event.payload, 'requestId', 'request_id'),
    correlationId: stringField(event.payload, 'correlationId', 'correlation_id'),
    displayCorrelationId: displayCorrelationIdFromEvent(event),
    bundleId: stringField(event.payload, 'bundleId', 'bundle_id'),
    toolCallId: stringField(event.payload, 'toolCallId', 'tool_call_id'),
    toolCallDetails: event.type === 'tool_call' || event.type === 'tool_bundle_call'
      ? toolDetails
      : null,
    toolOutputDetails: event.type === 'tool_output' || event.type === 'tool_bundle_output'
      ? toolDetails
      : null,
    screenshotRef,
    screenshot_ref: screenshotRef,
    screenshotUrl,
    screenshot_url: screenshotUrl,
    screenshotRefs,
    screenshot_refs: screenshotRefs,
    screenshot: stringField(event.payload, 'screenshot', 'image'),
    screenshotContentType,
    attachments,
    structuredPayload: structuredPayloadFrom(event.payload),
    sourceEventType: sourceEventTypeFromPayload(event.payload),
    success: typeof event.payload.success === 'boolean' ? event.payload.success : null,
    modelId: stringField(event.payload, 'modelId', 'model_id'),
    modelProvider: stringField(event.payload, 'modelProvider', 'model_provider'),
    raw: event.payload,
  };
}

const SCREENSHOT_METADATA_KEYS = [
  'screenshotRef',
  'screenshot_ref',
  'screenshotUrl',
  'screenshot_url',
  'screenshotRefs',
  'screenshot_refs',
  'screenshot',
  'image',
  'screenshotContentType',
  'screenshot_content_type',
  'attachments',
  'display_attachments',
];

function hasScreenshotMetadata(payload: JsonRecord): boolean {
  return SCREENSHOT_METADATA_KEYS.some(key => Object.prototype.hasOwnProperty.call(payload, key));
}

function preserveExistingScreenshotMetadata(
  row: Extract<SdkDisplayRow, { type: 'user_message' }>,
  metadata: SdkDisplayRowMetadata,
): SdkDisplayRowMetadata {
  const previous = row.metadata;
  const screenshotRef = previous?.screenshotRef ?? previous?.screenshot_ref ?? null;
  const screenshotUrl = previous?.screenshotUrl ?? previous?.screenshot_url ?? null;
  const screenshotRefs = previous?.screenshotRefs
    ?? previous?.screenshot_refs
    ?? (screenshotRef ? [screenshotRef] : null);
  const attachments = mergeDisplayAttachments(previous?.attachments, metadata.attachments);
  return {
    ...metadata,
    screenshotRef,
    screenshot_ref: screenshotRef,
    screenshotUrl,
    screenshot_url: screenshotUrl,
    screenshotRefs,
    screenshot_refs: screenshotRefs,
    screenshot: previous?.screenshot ?? null,
    screenshotContentType: previous?.screenshotContentType ?? null,
    attachments,
  };
}

function toolRowIdentity(event: ConversationEvent, index: number): string {
  if (event.type === 'tool_call') {
    const toolCall = modelFacingToolCallFromPayload(event.payload);
    return stringField(toolCall, 'id')
      ?? stringField(event.payload, 'toolCallId', 'tool_call_id', 'requestId', 'request_id', 'correlationId', 'correlation_id')
      ?? String(index);
  }
  if (event.type === 'tool_output') {
    return stringField(event.payload, 'toolCallId', 'tool_call_id', 'requestId', 'request_id', 'correlationId', 'correlation_id')
      ?? String(index);
  }
  if (event.type === 'tool_bundle_call' || event.type === 'tool_bundle_output') {
    return stringField(event.payload, 'bundleId', 'bundle_id', 'correlationId', 'correlation_id')
      ?? String(index);
  }
  return String(index);
}

function displayRowId(event: ConversationEvent, index: number): string {
  if (event.type === 'assistant_message') {
    return assistantDisplayRowId(event);
  }
  if (
    event.type === 'tool_call'
    || event.type === 'tool_progress'
    || event.type === 'tool_output'
    || event.type === 'tool_bundle_call'
    || event.type === 'tool_bundle_output'
  ) {
    return `${event.eventId}:${event.type}:${toolRowIdentity(event, index)}`;
  }
  return event.eventId;
}

function assistantDisplayRowId(event: ConversationEvent): string {
  return event.turnRef
    ? `${event.conversationRef}:${event.turnRef}:assistant`
    : event.eventId;
}

function assistantSegmentDisplayRowId(event: ConversationEvent): string {
  const baseId = assistantDisplayRowId(event);
  return event.turnRef ? `${baseId}:${event.eventId}` : event.eventId;
}

function streamingAssistantKey(event: ConversationEvent): string {
  return `${event.conversationRef}:${event.turnRef ?? event.eventId}`;
}

function conversationTurnKey(event: ConversationEvent): string | null {
  if (event.turnRef) {
    return `${event.conversationRef}:${event.turnRef}`;
  }
  return null;
}

function assistantDisplayRowIdForSegment(
  event: ConversationEvent,
  assistantRowsByTurn: Map<string, number>,
): string {
  const turnKey = conversationTurnKey(event);
  if (!turnKey || (assistantRowsByTurn.get(turnKey) ?? 0) === 0) {
    return assistantDisplayRowId(event);
  }
  return assistantSegmentDisplayRowId(event);
}

function recordAssistantDisplayRow(
  event: ConversationEvent,
  assistantRowsByTurn: Map<string, number>,
): void {
  const turnKey = conversationTurnKey(event);
  if (!turnKey) {
    return;
  }
  assistantRowsByTurn.set(turnKey, (assistantRowsByTurn.get(turnKey) ?? 0) + 1);
}

function displayRowBase(event: ConversationEvent, index: number) {
  return {
    id: displayRowId(event, index),
    conversationRef: event.conversationRef,
    turnRef: event.turnRef,
    index,
    metadata: displayRowMetadata(event),
  };
}

export type BuildDisplayRowsOptions = {
  liveAttachments?: Record<string, SdkDisplayAttachment[]> | null;
};

function userTurnKey(row: Pick<SdkDisplayRow, 'conversationRef' | 'turnRef'>): string | null {
  return row.turnRef ? `${row.conversationRef}:${row.turnRef}` : null;
}

function applyLiveAttachmentsToUserRow(
  row: Extract<SdkDisplayRow, { type: 'user_message' }>,
  options: BuildDisplayRowsOptions,
): Extract<SdkDisplayRow, { type: 'user_message' }> {
  const key = userTurnKey(row);
  const liveAttachments = key ? options.liveAttachments?.[key] ?? null : null;
  if (!liveAttachments || liveAttachments.length === 0) {
    return row;
  }
  return {
    ...row,
    metadata: {
      ...row.metadata,
      attachments: mergeDisplayAttachments(liveAttachments, row.metadata?.attachments),
    },
  };
}

function displayRowFromEvent(event: ConversationEvent, index: number): SdkDisplayRow | null {
  if (event.type === 'user_message') {
    return {
      ...displayRowBase(event, index),
      role: 'user',
      type: 'user_message',
      content: textFromPayload(event.payload),
    };
  }
  if (event.type === 'assistant_delta' || event.type === 'reasoning_delta') {
    return null;
  }
  if (event.type === 'assistant_message') {
    return {
      ...displayRowBase(event, index),
      role: 'assistant',
      type: 'assistant_message',
      content: textFromPayload(event.payload),
    };
  }
  if (event.type === 'tool_call') {
    const modelFacingToolCall = modelFacingToolCallFromPayload(event.payload);
    return {
      ...displayRowBase(event, index),
      role: 'assistant',
      type: 'tool_call',
      content: modelFacingToolCall,
      metadata: {
        ...displayRowMetadata(event),
        toolName: toolNameFromPayload(event.payload),
        modelFacingToolCall,
      },
    };
  }
  if (event.type === 'tool_progress') {
    return {
      ...displayRowBase(event, index),
      role: 'assistant',
      type: 'tool_progress',
      content: textFromPayload(event.payload),
      metadata: {
        ...displayRowMetadata(event),
        toolName: toolNameFromPayload(event.payload) ?? 'web_search',
      },
    };
  }
  if (event.type === 'tool_bundle_call') {
    return {
      ...displayRowBase(event, index),
      role: 'assistant',
      type: 'tool_bundle_call',
      content: bundleToolCallContentFromPayload(event.payload),
      metadata: {
        ...displayRowMetadata(event),
        toolName: 'tool_bundle',
      },
    };
  }
  if (event.type === 'tool_output') {
    return {
      ...displayRowBase(event, index),
      role: 'tool',
      type: 'tool_output',
      content: rawToolOutputTextFromPayload(event.payload),
      metadata: {
        ...displayRowMetadata(event),
        toolName: toolNameFromPayload(event.payload),
      },
    };
  }
  if (event.type === 'tool_bundle_output') {
    return {
      ...displayRowBase(event, index),
      role: 'tool',
      type: 'tool_bundle_output',
      content: bundleOutputContentFromPayload(event.payload),
      metadata: {
        ...displayRowMetadata(event),
        toolName: 'tool_bundle',
      },
    };
  }
  if (event.type === 'turn_error' || event.type === 'runtime_error') {
    if (event.type === 'turn_error' && shouldIgnoreCurrentTurnError(event.payload)) {
      return null;
    }
    return {
      ...displayRowBase(event, index),
      role: 'system',
      type: 'error',
      content: textFromPayload(event.payload) || 'Unknown runtime error',
    };
  }
  return null;
}

function mergeUserMessageMetadata(
  row: Extract<SdkDisplayRow, { type: 'user_message' }>,
  event: ConversationEvent,
): Extract<SdkDisplayRow, { type: 'user_message' }> {
  const metadata = hasScreenshotMetadata(event.payload)
    ? displayRowMetadata(event)
    : preserveExistingScreenshotMetadata(row, displayRowMetadata(event));
  return {
    ...row,
    metadata: {
      ...row.metadata,
      ...metadata,
      raw: {
        ...(recordFromUnknown(row.metadata?.raw) ?? {}),
        ...event.payload,
      },
    },
  };
}

type StreamingAssistantDisplayRow = Extract<SdkDisplayRow, { type: 'assistant_message' }>;

type StreamingAssistantState = {
  rowIndex: number | null;
  rowId: string | null;
  assistantText: string;
  reasoningText: string | null;
  eventIds: string[];
};

function buildStreamingAssistantRow(
  event: ConversationEvent,
  index: number,
  rowId: string,
  assistantText: string,
  reasoningText: string | null,
  eventIds: string[],
): StreamingAssistantDisplayRow {
  const raw = {
    ...event.payload,
    assistantText,
    reasoningText,
    sourceEventIds: eventIds,
  };
  return {
    id: rowId,
    conversationRef: event.conversationRef,
    turnRef: event.turnRef,
    index,
    role: 'assistant',
    type: 'assistant_message',
    content: assistantText,
    isStreaming: true,
    metadata: {
      ...displayRowMetadata(event),
      reasoningText,
      raw,
    },
  };
}

function buildFinalAssistantRow(
  event: ConversationEvent,
  index: number,
  rowId: string,
  streamingState?: StreamingAssistantState,
): StreamingAssistantDisplayRow {
  const reasoningText = streamingState?.reasoningText ?? null;
  const raw = reasoningText
    ? {
      ...event.payload,
      reasoningText,
      sourceEventIds: streamingState?.eventIds ?? [],
    }
    : event.payload;
  return {
    id: rowId,
    conversationRef: event.conversationRef,
    turnRef: event.turnRef,
    index,
    role: 'assistant',
    type: 'assistant_message',
    content: textFromPayload(event.payload),
    metadata: {
      ...displayRowMetadata(event),
      reasoningText,
      raw,
    },
  };
}

function replaceAssistantRowsForTurnWithError(
  rows: SdkDisplayRow[],
  event: ConversationEvent,
  errorRow: SdkDisplayRow,
): boolean {
  if (!event.turnRef) {
    return false;
  }
  const matchingIndexes: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (
      row.type === 'assistant_message'
      && row.conversationRef === event.conversationRef
      && row.turnRef === event.turnRef
    ) {
      matchingIndexes.push(index);
    }
  }
  if (matchingIndexes.length === 0) {
    return false;
  }
  const [firstIndex, ...extraIndexes] = matchingIndexes;
  for (let index = extraIndexes.length - 1; index >= 0; index -= 1) {
    rows.splice(extraIndexes[index], 1);
  }
  rows[firstIndex] = {
    ...errorRow,
    index: firstIndex,
  };
  return true;
}

export function buildDisplayRows(
  events: ConversationEvent[],
  options: BuildDisplayRowsOptions = {},
): SdkDisplayRow[] {
  const rows: SdkDisplayRow[] = [];
  const streamingAssistants = new Map<string, StreamingAssistantState>();
  const userRowsByTurn = new Map<string, number>();
  const assistantRowsByTurn = new Map<string, number>();
  const supersededTurnRefs = new Set<string>();
  for (const event of events) {
    if (event.type === 'turn_superseded') {
      const turnRef = normalizedTurnRef(event.turnRef);
      if (turnRef) {
        supersededTurnRefs.add(turnRef);
        streamingAssistants.delete(`${event.conversationRef}:${turnRef}`);
      }
      continue;
    }
    const eventTurnRef = normalizedTurnRef(event.turnRef);
    if (eventTurnRef && supersededTurnRefs.has(eventTurnRef)) {
      continue;
    }
    if (event.type === 'user_message_metadata') {
      const key = userMetadataKey(event);
      const rowIndex = key ? userRowsByTurn.get(key) : undefined;
      const row = typeof rowIndex === 'number' ? rows[rowIndex] : null;
      if (row?.type === 'user_message') {
        rows[rowIndex] = applyLiveAttachmentsToUserRow(
          mergeUserMessageMetadata(row, event),
          options,
        );
      }
      continue;
    }
    if (event.type === 'assistant_delta' || event.type === 'reasoning_delta') {
      const key = streamingAssistantKey(event);
      const current = streamingAssistants.get(key) ?? {
        rowIndex: null,
        rowId: null,
        assistantText: '',
        reasoningText: null,
        eventIds: [],
      };
      const text = textFromPayload(event.payload);
      const assistantText = event.type === 'assistant_delta'
        ? `${current.assistantText}${text}`
        : current.assistantText;
      const reasoningText = event.type === 'reasoning_delta'
        ? `${current.reasoningText ?? ''}${text}`
        : current.reasoningText;
      const rowIndex = current.rowIndex
        ?? (assistantText ? rows.length : null);
      const rowId = current.rowId
        ?? (assistantText ? assistantDisplayRowIdForSegment(event, assistantRowsByTurn) : null);
      const nextState: StreamingAssistantState = {
        rowIndex,
        rowId,
        assistantText,
        reasoningText,
        eventIds: [...current.eventIds, event.eventId],
      };
      streamingAssistants.set(key, nextState);
      if (nextState.rowIndex === null || nextState.rowId === null) {
        continue;
      }
      const row = buildStreamingAssistantRow(
        event,
        nextState.rowIndex,
        nextState.rowId,
        nextState.assistantText,
        nextState.reasoningText,
        nextState.eventIds,
      );
      if (nextState.rowIndex === rows.length) {
        rows.push(row);
      } else {
        rows[nextState.rowIndex] = row;
      }
      continue;
    }
    if (event.type === 'assistant_message') {
      const key = streamingAssistantKey(event);
      const streamingState = streamingAssistants.get(key);
      if (streamingState) {
        const rowIndex = streamingState.rowIndex ?? rows.length;
        const rowId = streamingState.rowId ?? assistantDisplayRowIdForSegment(event, assistantRowsByTurn);
        rows[rowIndex] = buildFinalAssistantRow(
          event,
          rowIndex,
          rowId,
          streamingState,
        );
        streamingAssistants.delete(key);
        recordAssistantDisplayRow(event, assistantRowsByTurn);
        continue;
      }
      const row = displayRowFromEvent(event, rows.length);
      if (row) {
        rows.push({
          ...row,
          id: assistantDisplayRowIdForSegment(event, assistantRowsByTurn),
        });
        recordAssistantDisplayRow(event, assistantRowsByTurn);
      }
      continue;
    }
    if (event.type === 'turn_error' || event.type === 'runtime_error') {
      if (event.type === 'turn_error' && shouldIgnoreCurrentTurnError(event.payload)) {
        continue;
      }
      const key = streamingAssistantKey(event);
      if (key) {
        streamingAssistants.delete(key);
      }
      const errorRow = displayRowFromEvent(
        event,
        rows.length,
      );
      if (errorRow) {
        if (!replaceAssistantRowsForTurnWithError(rows, event, errorRow)) {
          rows.push(errorRow);
        }
      }
      continue;
    }
    const row = displayRowFromEvent(event, rows.length);
    if (row) {
      rows.push(row);
      if (row.type === 'user_message') {
        rows[rows.length - 1] = applyLiveAttachmentsToUserRow(row, options);
        const key = userMetadataKey(event);
        if (key) {
          userRowsByTurn.set(key, rows.length - 1);
        }
      }
    }
  }
  return rows;
}

function userMetadataKey(event: ConversationEvent): string | null {
  if (event.turnRef) {
    return `${event.conversationRef}:${event.turnRef}`;
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

function numberField(record: JsonRecord | null, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function toolArgumentsFromPayload(payload: JsonRecord, modelFacingToolCall: JsonRecord | null): JsonRecord | null {
  const structuredPayload = structuredPayloadFrom(payload);
  return recordFromUnknown(modelFacingToolCall?.arguments)
    ?? recordFromUnknown(payload.args)
    ?? recordFromUnknown(payload.parameters)
    ?? recordFromUnknown(structuredPayload?.parameters)
    ?? null;
}

function toolMetadataFromPayload(payload: JsonRecord): JsonRecord | null {
  const structuredPayload = structuredPayloadFrom(payload);
  return recordFromUnknown(structuredPayload?.metadata)
    ?? recordFromUnknown(payload.metadata)
    ?? null;
}

function toolDisplayMetadataFromMetadata(metadata: JsonRecord | null): JsonRecord | null {
  if (!metadata) {
    return null;
  }
  const displayMetadata = { ...metadata };
  delete displayMetadata.model_facing_tool_call;
  return Object.keys(displayMetadata).length > 0 ? displayMetadata : null;
}

function toolExecutionSkippedFromMetadata(metadata: JsonRecord | null): boolean {
  return metadata?.skip_local_execution === true;
}

function toolRecoveryFieldsFromMetadata(metadata: JsonRecord | null): Pick<
  CurrentTurnToolEvent,
  'toolCallValidationFailed' | 'rawToolCallPreview' | 'rawArgumentsPreview' | 'parseError'
> {
  return {
    toolCallValidationFailed: metadata?.llm_tool_call_validation_failed === true,
    rawToolCallPreview: stringField(metadata, 'llm_tool_call_raw_tool_call_preview'),
    rawArgumentsPreview: stringField(metadata, 'llm_tool_call_raw_arguments_preview'),
    parseError: stringField(metadata, 'llm_tool_call_parse_error'),
  };
}

function bundleToolCallsFromPayload(payload: JsonRecord): JsonRecord[] | null {
  const structuredPayload = structuredPayloadFrom(payload);
  const rawTools = Array.isArray(structuredPayload?.tools)
    ? structuredPayload.tools
    : (Array.isArray(payload.tools) ? payload.tools : null);
  if (!rawTools) {
    return null;
  }
  const toolCalls = rawTools
    .map((item): JsonRecord | null => {
      const tool = recordFromUnknown(item);
      if (!tool) {
        return null;
      }
      const metadata = recordFromUnknown(tool.metadata);
      const modelFacing = recordFromUnknown(metadata?.model_facing_tool_call);
      const argumentsValue = recordFromUnknown(tool.args)
        ?? recordFromUnknown(tool.arguments)
        ?? {};
      if (modelFacing) {
        return {
          ...modelFacing,
          ...(recordFromUnknown(modelFacing.arguments) ? {} : { arguments: argumentsValue }),
        };
      }
      const name = stringField(tool, 'name', 'toolName', 'tool_name');
      return {
        ...(name ? { name } : {}),
        arguments: argumentsValue,
      };
    })
    .filter((tool): tool is JsonRecord => Boolean(tool && Object.keys(tool).length > 0));
  return toolCalls.length > 0 ? toolCalls : null;
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
    ? (event.type === 'tool_bundle_output' ? bundleDisplayTextFromPayload(event.payload) : displayTextFromPayload(event.payload))
    : textFromPayload(event.payload);
  const structuredPayload = structuredPayloadFrom(event.payload);
  const modelFacingToolCall = event.type === 'tool_call'
    ? modelFacingToolCallFromPayload(event.payload)
    : null;
  const toolMetadata = toolMetadataFromPayload(event.payload);
  const recoveryFields = toolRecoveryFieldsFromMetadata(toolMetadata);
  const success = typeof event.payload.success === 'boolean' ? event.payload.success : null;
  const attachments = displayAttachmentsField(event.payload, 'attachments', 'display_attachments')
    ?? legacyVisualAttachmentReplayAdapter(event);
  return {
    id: event.eventId,
    kind,
    toolName,
    requestId: stringField(event.payload, 'requestId'),
    correlationId: stringField(event.payload, 'correlationId'),
    bundleId: stringField(event.payload, 'bundleId'),
    modelFacingToolCall,
    toolCalls: event.type === 'tool_bundle_call' ? bundleToolCallsFromPayload(event.payload) : null,
    toolArguments: toolArgumentsFromPayload(event.payload, modelFacingToolCall),
    toolCallDetails: structuredPayload ?? event.payload,
    toolOutputDetails: structuredPayload ?? event.payload,
    toolMetadata,
    toolDisplayMetadata: toolDisplayMetadataFromMetadata(toolMetadata),
    attachments,
    ...recoveryFields,
    screenshot: stringField(event.payload, 'screenshot', 'image'),
    screenshotRef: stringField(event.payload, 'screenshotRef', 'screenshot_ref'),
    screenshotUrl: stringField(event.payload, 'screenshotUrl', 'screenshot_url'),
    screenshotContentType: stringField(event.payload, 'screenshotContentType', 'screenshot_content_type'),
    executionTime: numberField(event.payload, 'executionTime', 'execution_time')
      ?? numberField(structuredPayload, 'executionTime', 'execution_time'),
    ...(outputText ? { text: outputText } : {}),
    status: statusFromToolPayload(event.payload),
    success,
    executionSkipped: toolExecutionSkippedFromMetadata(toolMetadata),
    payload: event.payload,
  };
}

function emptyCurrentTurnProjection(
  conversationRef: string,
  turnRef: string | null = null,
): CurrentTurnProjection {
  const projection: Omit<CurrentTurnProjection, 'presentation'> = {
    conversationRef,
    turnRef,
    phase: turnRef ? 'awaiting' : 'idle',
    userMessageRowId: null,
    assistantText: '',
    reasoningText: null,
    toolEvents: [],
    lastError: null,
  };
  return withLiveTurnPresentation(projection);
}

function normalizedTurnRef(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resetCurrentTurnIfNeeded(
  current: CurrentTurnProjection,
  event: ConversationEvent,
): CurrentTurnProjection {
  if (isConversationControlProjectionEvent(event)) {
    return current;
  }
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

function visibleText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

function toolCallDisplayPreview(toolEvent: CurrentTurnToolEvent): string | null {
  if (toolEvent.kind !== 'tool_call') {
    return null;
  }
  if (toolEvent.toolCallValidationFailed === true) {
    const rawPreview = visibleText(toolEvent.rawToolCallPreview);
    if (rawPreview) {
      return rawPreview;
    }
  }

  const modelFacingToolCall = recordFromUnknown(toolEvent.modelFacingToolCall) ?? {};
  const argumentsValue = recordFromUnknown(modelFacingToolCall.arguments)
    ?? recordFromUnknown(modelFacingToolCall.args)
    ?? recordFromUnknown(toolEvent.toolArguments);
  const metadata = recordFromUnknown(toolEvent.toolDisplayMetadata);
  const id = stringField(modelFacingToolCall, 'id') ?? visibleText(toolEvent.requestId ?? null);
  const name = stringField(modelFacingToolCall, 'name') ?? visibleText(toolEvent.toolName ?? null);
  const thoughtSignature = stringField(modelFacingToolCall, 'thought_signature', 'thoughtSignature')
    ?? (metadata ? stringField(metadata, 'thought_signature', 'thoughtSignature') : null);
  const preview: JsonRecord = {};
  if (id) {
    preview.id = id;
  }
  if (name) {
    preview.name = name;
  }
  if (
    argumentsValue
    && (toolEvent.toolCallValidationFailed !== true || Object.keys(argumentsValue).length > 0)
  ) {
    preview.arguments = argumentsValue;
  }
  if (metadata && Object.keys(metadata).length > 0) {
    preview.metadata = metadata;
  }
  if (thoughtSignature) {
    preview.thought_signature = thoughtSignature;
  }
  const rawToolCallPreview = visibleText(toolEvent.rawToolCallPreview);
  if (rawToolCallPreview) {
    preview.raw_tool_call_preview = rawToolCallPreview;
  }
  const rawArgumentsPreview = visibleText(toolEvent.rawArgumentsPreview);
  if (rawArgumentsPreview) {
    preview.raw_arguments_preview = rawArgumentsPreview;
  }
  const parseError = visibleText(toolEvent.parseError);
  if (parseError) {
    preview.parse_error = parseError;
  }
  if (toolEvent.executionSkipped === true) {
    preview.execution_skipped = true;
  }
  return Object.keys(preview).length > 0 ? JSON.stringify(preview, null, 2) : null;
}

function toolEntryText(toolEvent: CurrentTurnToolEvent): string {
  const text = visibleText(toolEvent.text);
  if (text) {
    return text;
  }
  const toolName = visibleText(toolEvent.toolName ?? null);
  if (toolEvent.kind === 'tool_output') {
    return toolName ? `${toolName} completed` : 'Tool completed';
  }
  if (toolEvent.kind === 'tool_progress') {
    return toolName ? `${toolName} is running` : 'Tool is running';
  }
  const toolCallPreview = toolCallDisplayPreview(toolEvent);
  if (toolCallPreview) {
    return toolCallPreview;
  }
  return toolName ? `Using ${toolName}` : 'Using tool';
}

function toolEntryType(toolEvent: CurrentTurnToolEvent): LiveTurnPresentationEntry['type'] {
  if (toolEvent.kind === 'tool_output') {
    return 'tool-output';
  }
  if (toolEvent.kind === 'tool_progress') {
    return 'tool-progress';
  }
  return 'tool-call';
}

function buildLiveTurnPresentation(
  projection: Omit<CurrentTurnProjection, 'presentation'>,
): LiveTurnPresentation {
  const baseId = `${projection.conversationRef || 'conversation'}:${projection.turnRef || 'turn'}`;
  const entries: LiveTurnPresentationEntry[] = [];
  const reasoningText = visibleText(projection.reasoningText);
  if (reasoningText) {
    entries.push({
      id: `${baseId}:thinking`,
      type: 'thinking',
      text: reasoningText,
      sourceEventType: 'reasoning_delta',
      sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
      turnRef: projection.turnRef,
    });
  }
  projection.toolEvents.forEach((toolEvent, index) => {
    entries.push({
      id: `${baseId}:tool:${toolEvent.id || index}`,
      type: toolEntryType(toolEvent),
      text: toolEntryText(toolEvent),
      sourceEventType: toolEvent.kind,
      sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
      turnRef: projection.turnRef,
      toolName: toolEvent.toolName ?? null,
      requestId: toolEvent.requestId ?? null,
      correlationId: toolEvent.correlationId ?? null,
      bundleId: toolEvent.bundleId ?? null,
      modelFacingToolCall: toolEvent.modelFacingToolCall ?? null,
      toolCalls: toolEvent.toolCalls ?? null,
      toolArguments: toolEvent.toolArguments ?? null,
      toolCallDetails: toolEvent.toolCallDetails ?? null,
      toolOutputDetails: toolEvent.toolOutputDetails ?? null,
      toolMetadata: toolEvent.toolMetadata ?? null,
      toolDisplayMetadata: toolEvent.toolDisplayMetadata ?? null,
      attachments: toolEvent.attachments ?? null,
      toolCallValidationFailed: toolEvent.toolCallValidationFailed ?? null,
      rawToolCallPreview: toolEvent.rawToolCallPreview ?? null,
      rawArgumentsPreview: toolEvent.rawArgumentsPreview ?? null,
      parseError: toolEvent.parseError ?? null,
      screenshot: toolEvent.screenshot ?? null,
      screenshotRef: toolEvent.screenshotRef ?? null,
      screenshotUrl: toolEvent.screenshotUrl ?? null,
      screenshotContentType: toolEvent.screenshotContentType ?? null,
      executionTime: toolEvent.executionTime ?? null,
      success: toolEvent.success ?? null,
      executionSkipped: toolEvent.executionSkipped ?? null,
      payload: toolEvent.payload,
    });
  });
  const assistantText = visibleText(projection.assistantText);
  if (assistantText) {
    entries.push({
      id: `${baseId}:assistant`,
      type: 'llm-text',
      text: assistantText,
      sourceEventType: 'assistant_delta',
      sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
      turnRef: projection.turnRef,
      isComplete: projection.phase === 'complete',
    });
  }
  const errorText = visibleText(projection.lastError);
  if (errorText) {
    entries.push({
      id: `${baseId}:error`,
      type: 'error',
      text: errorText,
      sourceEventType: 'runtime_error',
      sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
      turnRef: projection.turnRef,
      isComplete: true,
    });
  }
  const activePhases = new Set<CurrentTurnProjectionPhase>([
    'awaiting',
    'streaming',
    'tool_call',
    'tool_output',
  ]);
  const terminalPhases = new Set<CurrentTurnProjectionPhase>([
    'complete',
    'error',
  ]);
  const hasVisibleContent = entries.length > 0;
  const isBusy = activePhases.has(projection.phase);
  const typingVisible = projection.phase === 'awaiting' && !hasVisibleContent;
  const overlayIntentMode = hasVisibleContent ? 'response' : (typingVisible ? 'awaiting' : 'hidden');
  const overlayVisible = overlayIntentMode !== 'hidden';
  return {
    conversationRef: projection.conversationRef,
    turnRef: projection.turnRef,
    phase: projection.phase,
    entries,
    hasVisibleContent,
    typingVisible,
    overlayVisible,
    isBusy,
    isTerminal: terminalPhases.has(projection.phase),
    lastError: projection.lastError,
    awaitingAnchor: typingVisible && projection.userMessageRowId
      ? {
        kind: 'user-message',
        rowId: projection.userMessageRowId,
        turnRef: projection.turnRef,
        conversationRef: projection.conversationRef,
      }
      : null,
    overlayIntent: {
      visible: overlayVisible,
      mode: overlayIntentMode,
      turnRef: projection.turnRef,
      conversationRef: projection.conversationRef,
      staleGuardRef: projection.turnRef,
    },
  };
}

function withLiveTurnPresentation(
  projection: Omit<CurrentTurnProjection, 'presentation'>,
): CurrentTurnProjection {
  return {
    ...projection,
    presentation: buildLiveTurnPresentation(projection),
  };
}

export function buildCurrentTurnProjection(events: ConversationEvent[]): CurrentTurnProjection {
  let projection = emptyCurrentTurnProjection(events[0]?.conversationRef ?? '');
  const supersededTurnRefs = new Set<string>();
  for (const event of events) {
    if (event.type === 'turn_superseded') {
      const supersededTurnRef = normalizedTurnRef(event.turnRef);
      if (supersededTurnRef) {
        supersededTurnRefs.add(supersededTurnRef);
      }
      if (supersededTurnRef && projection.turnRef === supersededTurnRef) {
        projection = {
          ...projection,
          phase: 'complete',
          lastError: null,
        };
      }
      continue;
    }
    const turnRef = normalizedTurnRef(event.turnRef);
    if (turnRef && supersededTurnRefs.has(turnRef)) {
      continue;
    }
    projection = resetCurrentTurnIfNeeded(projection, event);
    if (!projection.conversationRef) {
      projection = { ...projection, conversationRef: event.conversationRef };
    }
    if (isConversationControlProjectionEvent(event)) {
      continue;
    }
    if (!projection.turnRef && event.turnRef) {
      projection = { ...projection, turnRef: event.turnRef };
    }

    if (event.type === 'turn_started' || event.type === 'user_message') {
      const nextProjection = advanceCurrentTurnPhase(projection, 'awaiting');
      projection = event.type === 'user_message'
        ? {
          ...nextProjection,
          userMessageRowId: displayRowId(event, 0),
        }
        : nextProjection;
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
    if (event.type === 'turn_stopped') {
      projection = {
        ...projection,
        phase: 'complete',
        lastError: null,
      };
      continue;
    }
    if (event.type === 'turn_error' || event.type === 'runtime_error') {
      if (shouldIgnoreCurrentTurnError(event.payload)) {
        continue;
      }
      projection = {
        ...projection,
        phase: 'error',
        assistantText: '',
        lastError: textFromPayload(event.payload) || 'Unknown runtime error',
      };
    }
  }
  return withLiveTurnPresentation(projection);
}

export function isInternalConversationLane(conversationRef: string | null | undefined): boolean {
  return typeof conversationRef === 'string' && conversationRef.startsWith('conv-agent-');
}

function rowRevisionId(row: SdkDisplayRow): string | null {
  const revisionId = row.metadata?.revisionId;
  return typeof revisionId === 'string' && revisionId.trim() ? revisionId.trim() : null;
}

function stableEditTargetRowId(row: SdkDisplayRow): string {
  const replacedDisplayRowId = row.metadata?.replacedDisplayRowId;
  return typeof replacedDisplayRowId === 'string' && replacedDisplayRowId.trim()
    ? replacedDisplayRowId.trim()
    : row.id;
}

function withConversationViewRowActions(row: SdkDisplayRow): SdkDisplayRow {
  if (row.type === 'user_message') {
    return {
      ...row,
      actions: {
        ...(row.actions ?? {}),
        canEdit: true,
        editTargetRowId: stableEditTargetRowId(row),
      },
    };
  }
  if (row.type === 'assistant_message') {
    return {
      ...row,
      actions: {
        ...(row.actions ?? {}),
        canRetry: row.isStreaming !== true,
        retryTargetRowId: row.id,
      },
    };
  }
  if (row.type === 'error') {
    return {
      ...row,
      actions: {
        ...(row.actions ?? {}),
        canRetry: true,
        retryTargetRowId: row.id,
      },
    };
  }
  return row;
}

function resolveConversationViewConversationRef(input: ConversationViewBuildInput): string {
  const candidates = [
    input.conversationRef,
    input.state?.conversationRef,
    input.displayRows?.find(row => !isInternalConversationLane(row.conversationRef))?.conversationRef,
    input.events?.find(event => !isInternalConversationLane(event.conversationRef))?.conversationRef,
    input.currentTurn && !isInternalConversationLane(input.currentTurn.conversationRef)
      ? input.currentTurn.conversationRef
      : null,
    input.currentTurn?.conversationRef,
  ];
  return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

function resolveConversationViewRevisionId(
  input: ConversationViewBuildInput,
  displayRows: SdkDisplayRow[],
): string | null {
  const displayRevision = [...displayRows].reverse().map(rowRevisionId).find(Boolean);
  const candidates = [
    input.revisionId,
    input.state?.revisionId,
    displayRevision,
    input.events?.[input.events.length - 1]?.revisionId,
  ];
  return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? null;
}

function userFacingEventsForView(
  events: ConversationEvent[],
  conversationRef: string,
  revisionId: string | null = null,
): ConversationEvent[] {
  return events.filter(event => (
    event.conversationRef === conversationRef
    && !isInternalConversationLane(event.conversationRef)
    && (!revisionId || event.revisionId === revisionId)
  ));
}

function currentTurnForView(
  input: ConversationViewBuildInput,
  conversationRef: string,
  revisionId: string | null,
): CurrentTurnProjection {
  const events = input.events ?? [];
  const currentTurn = input.currentTurn ?? null;
  const userFacingEvents = userFacingEventsForView(events, conversationRef, revisionId);
  if (userFacingEvents.length > 0) {
    return buildCurrentTurnProjection(userFacingEvents);
  }
  if (
    !revisionId
    && currentTurn
    && currentTurn.conversationRef === conversationRef
    && !isInternalConversationLane(currentTurn.conversationRef)
  ) {
    return currentTurn;
  }
  return emptyCurrentTurnProjection(conversationRef);
}

function conversationViewLiveTurnPhase(phase: CurrentTurnProjectionPhase): ConversationViewLiveTurnPhase {
  if (phase === 'tool_call' || phase === 'tool_output') {
    return 'tool';
  }
  return phase;
}

function responseOverlayModeFromPresentation(
  presentation: LiveTurnPresentation,
): ConversationView['surfaces']['responseOverlay']['mode'] {
  if (presentation.overlayIntent.mode === 'response') {
    return 'response';
  }
  if (presentation.overlayIntent.mode === 'awaiting') {
    return 'typing';
  }
  return 'hidden';
}

function latestEventRef(
  events: ConversationEvent[],
  predicate: (event: ConversationEvent) => boolean = () => true,
): string | null {
  const event = [...events].reverse().find(predicate);
  return event?.eventId ?? null;
}

function modelHistoryCheckpointIdFromEvents(events: ConversationEvent[], revisionId: string | null): string | null {
  const event = [...events].reverse().find(candidate => (
    candidate.type === 'model_history_updated'
    && (!revisionId || candidate.revisionId === revisionId)
  ));
  return stringField(event?.payload ?? {}, 'checkpointId', 'checkpoint_id');
}

function liveToolEntryTypeMatchesDisplayRow(
  entry: LiveTurnPresentationEntry,
  row: SdkDisplayRow,
): boolean {
  if (entry.type === 'tool-call') {
    return row.type === 'tool_call' || row.type === 'tool_bundle_call';
  }
  if (entry.type === 'tool-output') {
    return row.type === 'tool_output' || row.type === 'tool_bundle_output';
  }
  if (entry.type === 'tool-progress') {
    return row.type === 'tool_progress';
  }
  return false;
}

function identityFromToolRecord(record: JsonRecord | null): string | null {
  const metadata = recordFromUnknown(record?.metadata);
  return stringField(
    record,
    'toolCallId',
    'tool_call_id',
    'id',
    'requestId',
    'request_id',
    'bundleId',
    'bundle_id',
    'displayCorrelationId',
    'correlationId',
    'correlation_id',
  ) ?? stringField(
    metadata,
    'toolCallId',
    'tool_call_id',
    'requestId',
    'request_id',
    'bundleId',
    'bundle_id',
    'displayCorrelationId',
    'correlationId',
    'correlation_id',
  );
}

function liveToolEntryIdentity(entry: LiveTurnPresentationEntry): string | null {
  return stringField(
    entry,
    'correlationId',
    'requestId',
    'bundleId',
  )
    ?? identityFromToolRecord(recordFromUnknown(entry.toolCallDetails))
    ?? identityFromToolRecord(recordFromUnknown(entry.toolOutputDetails))
    ?? identityFromToolRecord(recordFromUnknown(entry.modelFacingToolCall));
}

function displayRowToolIdentity(row: SdkDisplayRow): string | null {
  const metadata = row.metadata ?? {};
  return stringField(
    metadata,
    'displayCorrelationId',
    'toolCallId',
    'tool_call_id',
    'requestId',
    'request_id',
    'bundleId',
    'bundle_id',
    'correlationId',
    'correlation_id',
    'eventId',
  )
    ?? identityFromToolRecord(recordFromUnknown(metadata.toolCallDetails))
    ?? identityFromToolRecord(recordFromUnknown(metadata.toolOutputDetails))
    ?? identityFromToolRecord(recordFromUnknown(metadata.modelFacingToolCall))
    ?? identityFromToolRecord(recordFromUnknown(row.content));
}

function displayRowMaterializesLiveToolEntry(
  row: SdkDisplayRow,
  entry: LiveTurnPresentationEntry,
): boolean {
  if (!liveToolEntryTypeMatchesDisplayRow(entry, row)) {
    return false;
  }
  if (entry.turnRef && row.turnRef && entry.turnRef !== row.turnRef) {
    return false;
  }
  const entryIdentity = liveToolEntryIdentity(entry);
  return Boolean(entryIdentity && displayRowToolIdentity(row) === entryIdentity);
}

function filterMaterializedLiveTurnEntries(
  entries: LiveTurnPresentationEntry[],
  displayRows: SdkDisplayRow[],
): LiveTurnPresentationEntry[] {
  return entries.filter(entry => (
    (
      entry.type !== 'tool-call'
      && entry.type !== 'tool-output'
      && entry.type !== 'tool-progress'
    )
    || !displayRows.some(row => displayRowMaterializesLiveToolEntry(row, entry))
  ));
}

export function buildConversationView(input: ConversationViewBuildInput): ConversationView {
  const conversationRef = resolveConversationViewConversationRef(input);
  const displayRows = (input.displayRows ?? []).filter(row => (
    row.conversationRef === conversationRef
    && !isInternalConversationLane(row.conversationRef)
  )).map(withConversationViewRowActions);
  const revisionId = resolveConversationViewRevisionId(input, displayRows);
  const currentTurn = currentTurnForView(input, conversationRef, revisionId);
  const livePhase = conversationViewLiveTurnPhase(currentTurn.phase);
  const presentation = currentTurn.presentation;
  const liveTurnEntries = filterMaterializedLiveTurnEntries(presentation.entries, displayRows);
  const responseOverlayMode = responseOverlayModeFromPresentation(presentation);
  const isBusy = presentation.isBusy;
  return {
    conversationRef,
    revisionId,
    displayRows,
    liveTurn: {
      turnRef: currentTurn.turnRef,
      phase: livePhase,
      entries: liveTurnEntries,
      isBusy,
      isTerminal: presentation.isTerminal,
      canStop: isBusy && Boolean(currentTurn.turnRef),
      lastError: currentTurn.lastError,
    },
    surfaces: {
      pill: {
        mode: isBusy ? 'busy' : 'idle',
      },
      dashboard: {
        mode: isBusy ? 'busy' : 'idle',
      },
      responseOverlay: {
        mode: responseOverlayMode,
        visible: responseOverlayMode !== 'hidden',
        guardRef: presentation.overlayIntent.staleGuardRef,
        ownerConversationRef: conversationRef,
        turnRef: currentTurn.turnRef,
      },
    },
    actions: {
      canEdit: displayRows.some(row => row.actions?.canEdit === true),
      canRetry: presentation.isTerminal && displayRows.some(row => row.actions?.canRetry === true),
      canFork: displayRows.length > 0,
    },
  };
}

export function buildConversationViewBuildDiagnostics(
  input: ConversationViewBuildInput & { view?: ConversationView | null },
): ConversationViewBuildDiagnostics {
  const view = input.view ?? buildConversationView(input);
  const events = input.events ?? [];
  const modelHistoryCheckpointId = input.modelHistoryCheckpoint?.checkpointId
    ?? modelHistoryCheckpointIdFromEvents(events, view.revisionId);
  return {
    activeRevisionId: view.revisionId,
    displayRowCount: view.displayRows.length,
    liveTurnRef: view.liveTurn.turnRef,
    liveTurnPhase: view.liveTurn.phase,
    responseOverlayMode: view.surfaces.responseOverlay.mode,
    responseOverlayGuardRef: view.surfaces.responseOverlay.guardRef,
    pendingTurnRef: input.pendingTurnRef ?? null,
    supersededTurnCount: events.filter(event => event.type === 'turn_superseded').length,
    filteredInternalLaneCount: events.filter(event => isInternalConversationLane(event.conversationRef)).length,
    modelHistoryCheckpointId,
    lastEventRef: latestEventRef(events),
    lastSdkEventRef: latestEventRef(events, event => event.source === 'sdk'),
    lastBackendEventRef: latestEventRef(events, event => event.source === 'backend'),
  };
}

function toolOutputDedupeKey(event: ConversationEvent): string | null {
  if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
    return null;
  }
  return resolveToolOutputDedupeKey(event.payload);
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
      message_type: 'tool_output',
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
      message_type: 'tool_output',
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
    if (candidateHasModelContent !== currentHasModelContent) {
      return candidateHasModelContent;
    }
    if (candidate.source === 'backend' && current.source !== 'backend') {
      return true;
    }
    if (candidate.source !== 'backend' && current.source === 'backend') {
      return false;
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

function withoutOrphanEmptyChatGreeting(events: ConversationEvent[]): ConversationEvent[] {
  const hasUserMessage = events.some(event => event.type === 'user_message');
  if (hasUserMessage) {
    return events;
  }
  return events.filter(event => (
    event.type !== 'assistant_message'
    || textFromPayload(event.payload).trim() !== EMPTY_CHAT_GREETING_TEXT
  ));
}

function withoutAssistantMessagesForErroredTurns(events: ConversationEvent[]): ConversationEvent[] {
  const erroredTurnKeys = new Set<string>();
  for (const event of events) {
    if (
      (event.type === 'turn_error' || event.type === 'runtime_error')
      && !(event.type === 'turn_error' && shouldIgnoreCurrentTurnError(event.payload))
    ) {
      erroredTurnKeys.add(streamingAssistantKey(event));
    }
  }
  if (erroredTurnKeys.size === 0) {
    return events;
  }
  return events.filter(event => (
    event.type !== 'assistant_message'
    || !erroredTurnKeys.has(streamingAssistantKey(event))
  ));
}

function withoutSupersededTurnLiveEvents(events: ConversationEvent[]): ConversationEvent[] {
  const supersededTurnRefs = new Set<string>();
  const filtered: ConversationEvent[] = [];
  for (const event of events) {
    if (event.type === 'turn_superseded') {
      const turnRef = normalizedTurnRef(event.turnRef);
      if (turnRef) {
        supersededTurnRefs.add(turnRef);
      }
      filtered.push(event);
      continue;
    }
    const turnRef = normalizedTurnRef(event.turnRef);
    if (turnRef && supersededTurnRefs.has(turnRef)) {
      continue;
    }
    filtered.push(event);
  }
  return filtered;
}

type NativeWebSearchProgressEntry = {
  eventId: string;
  text: string;
  query: string | null;
  url: string | null;
  pattern: string | null;
  actionType: string | null;
};

type NativeWebSearchProgressGroup = {
  firstIndex: number;
  conversationRef: string;
  turnRef: string | null;
  revisionId: string;
  timestamp: string;
  requestId: string | null;
  correlationId: string | null;
  entries: NativeWebSearchProgressEntry[];
};

function isWebSearchToolName(toolName: string | null): boolean {
  return (toolName ?? '').trim() === 'web_search';
}

function modelFacingToolNameFromPayload(payload: JsonRecord): string | null {
  const firstToolCall = recordFromUnknown(toolCallsFromPayload(payload)?.[0]);
  return stringField(firstToolCall, 'name', 'toolName', 'tool_name');
}

function isWebSearchToolPayload(payload: JsonRecord): boolean {
  return isWebSearchToolName(toolNameFromPayload(payload) ?? modelFacingToolNameFromPayload(payload));
}

function isNativeWebSearchProgressPayload(payload: JsonRecord): boolean {
  if (isWebSearchToolPayload(payload)) {
    return true;
  }
  if (stringField(payload, 'sourceEventType', 'source_event_type') === 'web-search-progress') {
    return true;
  }
  return false;
}

function progressGroupIdentity(event: ConversationEvent): string | null {
  return stringField(event.payload, 'requestId', 'request_id', 'correlationId', 'correlation_id');
}

function nativeWebSearchProgressGroupKey(event: ConversationEvent): string {
  const identity = progressGroupIdentity(event);
  if (identity) {
    return `${event.conversationRef}:${event.turnRef ?? 'no-turn'}:${identity}`;
  }
  if (event.turnRef) {
    return `${event.conversationRef}:${event.turnRef}:native-web-search`;
  }
  return `${event.conversationRef}:${event.eventId}:native-web-search`;
}

function realWebSearchPairGroupKeys(events: ConversationEvent[]): Set<string> {
  const callGroups = new Set<string>();
  const outputGroups = new Set<string>();
  for (const event of events) {
    if (
      (event.type !== 'tool_call' && event.type !== 'tool_output')
      || !isWebSearchToolPayload(event.payload)
    ) {
      continue;
    }
    const groupKey = nativeWebSearchProgressGroupKey(event);
    if (event.type === 'tool_call') {
      callGroups.add(groupKey);
    } else {
      outputGroups.add(groupKey);
    }
  }
  const pairGroups = new Set<string>();
  for (const groupKey of callGroups) {
    if (outputGroups.has(groupKey)) {
      pairGroups.add(groupKey);
    }
  }
  return pairGroups;
}

function nativeWebSearchProgressEntry(event: ConversationEvent): NativeWebSearchProgressEntry | null {
  if (event.type !== 'tool_progress') {
    return null;
  }
  if (!isNativeWebSearchProgressPayload(event.payload)) {
    return null;
  }
  const text = textFromPayload(event.payload).trim();
  if (!text) {
    return null;
  }
  return {
    eventId: event.eventId,
    text,
    query: stringField(event.payload, 'query'),
    url: stringField(event.payload, 'url'),
    pattern: stringField(event.payload, 'pattern'),
    actionType: stringField(event.payload, 'actionType', 'action_type'),
  };
}

function nativeWebSearchToolCallId(group: NativeWebSearchProgressGroup): string {
  return [
    'native-web-search',
    group.turnRef ?? group.requestId ?? group.entries[0]?.eventId ?? 'progress',
    group.requestId ?? group.correlationId ?? 'trace',
  ].join(':');
}

function nativeWebSearchQuery(group: NativeWebSearchProgressGroup): string {
  const explicitQuery = group.entries.find(entry => entry.query)?.query;
  if (explicitQuery) {
    return explicitQuery;
  }
  const sourceHosts = Array.from(new Set(group.entries.flatMap(entry => {
    if (!entry.url) {
      return [];
    }
    try {
      return [new URL(entry.url).hostname.replace(/^www\./, '')];
    } catch {
      return [];
    }
  })));
  if (sourceHosts.length > 0) {
    return `Native web search over ${sourceHosts.slice(0, 5).join(', ')}`;
  }
  return 'Native web search';
}

function nativeWebSearchToolOutput(group: NativeWebSearchProgressGroup): string {
  const uniqueLines: string[] = [];
  const seen = new Set<string>();
  for (const entry of group.entries) {
    if (seen.has(entry.text)) {
      continue;
    }
    seen.add(entry.text);
    uniqueLines.push(entry.text);
  }
  return [
    'Native web_search activity:',
    ...uniqueLines.map(line => `- ${line}`),
  ].join('\n');
}

function buildNativeWebSearchSyntheticEvents(
  group: NativeWebSearchProgressGroup,
): ConversationEvent[] {
  const toolCallId = nativeWebSearchToolCallId(group);
  const argumentsPayload = {
    query: nativeWebSearchQuery(group),
    count: Math.max(1, Math.min(group.entries.length, 10)),
  };
  const commonPayload = {
    toolName: 'web_search',
    requestId: group.requestId,
    correlationId: group.correlationId ?? group.requestId,
    toolCallId,
    syntheticNativeWebSearch: true,
    synthetic_native_web_search: true,
    sourceEventIds: group.entries.map(entry => entry.eventId),
    nativeProgress: group.entries,
  };
  return [
    {
      eventId: `${toolCallId}:call`,
      type: 'tool_call',
      conversationRef: group.conversationRef,
      turnRef: group.turnRef,
      revisionId: group.revisionId,
      timestamp: group.timestamp,
      source: 'sdk',
      payload: {
        ...commonPayload,
        args: argumentsPayload,
        tool_calls: [{
          id: toolCallId,
          name: 'web_search',
          arguments: argumentsPayload,
        }],
        structuredPayload: {
          synthetic_native_web_search: true,
          progress_events: group.entries,
        },
      },
    },
    {
      eventId: `${toolCallId}:output`,
      type: 'tool_output',
      conversationRef: group.conversationRef,
      turnRef: group.turnRef,
      revisionId: group.revisionId,
      timestamp: group.timestamp,
      source: 'sdk',
      payload: {
        ...commonPayload,
        success: true,
        output: nativeWebSearchToolOutput(group),
        structuredPayload: {
          synthetic_native_web_search: true,
          progress_events: group.entries,
        },
      },
    },
  ];
}

function withSyntheticNativeWebSearchToolPairs(events: ConversationEvent[]): ConversationEvent[] {
  const existingPairGroups = realWebSearchPairGroupKeys(events);
  const groups = new Map<string, NativeWebSearchProgressGroup>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const entry = nativeWebSearchProgressEntry(event);
    if (!entry) {
      continue;
    }
    const key = nativeWebSearchProgressGroupKey(event);
    if (existingPairGroups.has(key)) {
      continue;
    }
    const current = groups.get(key);
    if (current) {
      current.entries.push(entry);
      continue;
    }
    groups.set(key, {
      firstIndex: index,
      conversationRef: event.conversationRef,
      turnRef: event.turnRef ?? null,
      revisionId: event.revisionId,
      timestamp: event.timestamp,
      requestId: stringField(event.payload, 'requestId', 'request_id'),
      correlationId: stringField(event.payload, 'correlationId', 'correlation_id'),
      entries: [entry],
    });
  }
  if (groups.size === 0) {
    return events;
  }
  const insertions = new Map<number, ConversationEvent[]>();
  for (const group of groups.values()) {
    insertions.set(group.firstIndex, buildNativeWebSearchSyntheticEvents(group));
  }
  return events.flatMap((event, index) => [
    ...(insertions.get(index) ?? []),
    event,
  ]);
}

function toDisplayMessage(event: ConversationEvent): DisplayMessage | null {
  if (event.type === 'assistant_delta') {
    return null;
  }
  if (event.type === 'reasoning_delta') {
    return null;
  }
  if (
    event.type === 'memory_retrieval_diagnostic'
    || event.type === 'memory_store_changed'
    || event.type === 'trace_event'
    || event.type === 'model_history_updated'
    || event.type === 'turn_superseded'
  ) {
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
  } else if (event.type === 'tool_progress') {
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
      skippedReason: stringField(compactionEvent.payload, 'skippedReason'),
      debug: compactionEvent.payload,
    };
  }
  if (compactionEvent.type === 'compaction_applied') {
    return {
      status: 'applied',
      generationId: stringField(compactionEvent.payload, 'generationId'),
      summaryPreview: stringField(compactionEvent.payload, 'summaryPreview'),
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
  const displayEvents = withoutAssistantMessagesForErroredTurns(
    withoutOrphanEmptyChatGreeting(withoutDuplicateToolOutputs(withoutSupersededTurnLiveEvents(events))),
  );
  return {
    conversationRef: first?.conversationRef ?? '',
    revisionId: last?.revisionId ?? first?.revisionId ?? '',
    messages: displayEvents.map(toDisplayMessage).filter((message): message is DisplayMessage => Boolean(message)),
    compaction: buildCompactionState(events),
  };
}

export function buildTraceTimeline(events: ConversationEvent[], options: {
  conversationRef?: string | null;
  turnRef?: string | null;
  traceId?: string | null;
  path?: string | null;
} = {}): TraceTimelineEntry[] {
  return events
    .filter(event => event.type === 'trace_event')
    .filter(event => !options.conversationRef || event.conversationRef === options.conversationRef)
    .filter(event => !options.turnRef || event.turnRef === options.turnRef)
    .filter(event => {
      if (!isTracePayload(event.payload)) {
        return false;
      }
      if (options.traceId && event.payload.traceId !== options.traceId) {
        return false;
      }
      if (options.path && event.payload.path !== options.path) {
        return false;
      }
      return true;
    })
    .map(event => ({
      ...(event.payload as TraceEventPayload),
      eventId: event.eventId,
      timestamp: event.timestamp,
    }));
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
      message_type: 'user_query',
      content: textFromPayload(event.payload),
    }, event.payload)];
  }
  if (event.type === 'assistant_message') {
    return [withStructuredPayload({
      role: 'assistant',
      message_type: 'assistant_response',
      content: textFromPayload(event.payload),
    }, event.payload)];
  }
  if (event.type === 'tool_call') {
    return [withStructuredPayload({
      role: 'assistant',
      message_type: 'assistant_response',
      content: textFromPayload(event.payload),
      tool_calls: toolCallsFromPayload(event.payload),
      tool_call_id: stringField(event.payload, 'toolCallId', 'tool_call_id'),
    }, event.payload)];
  }
  if (event.type === 'tool_bundle_call') {
    return [withStructuredPayload({
      role: 'assistant',
      message_type: 'assistant_response',
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
      message_type: 'tool_output',
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
  const rehydrateEvents = withoutOrphanEmptyChatGreeting(
    withoutDanglingToolPairs(withoutDuplicateToolOutputs(
      withSyntheticNativeWebSearchToolPairs(withoutSupersededTurnLiveEvents(events)),
    )),
  );
  return {
    conversationRef: display.conversationRef,
    revisionId: display.revisionId,
    messages: rehydrateEvents.flatMap(toRehydrateMessages),
    replayGenerationId: null,
  };
}
