/**
 * Normalizes renderer chat stream event payloads for UI side effects.
 */

import type { TokenCounts } from './desktopChatMessageTypes';
import type {
  CompactedReplaySnapshot,
  ConversationEvent,
  JsonRecord,
} from './desktopConversationRuntimeContracts';
import { DesktopSettingsUpdateErrorRuntime } from './desktopSettingsUpdateErrorRuntime';

const {
  isSettingsUpdateErrorPayload,
} = DesktopSettingsUpdateErrorRuntime;

const RECOVERABLE_TOOL_PARSE_ERROR_MARKERS = [
  'failed to parse streamed tool-call arguments',
  'raw arguments preview:',
];

type ErrorPayload = {
  message?: unknown;
  content?: unknown;
};

type EventPayload = Record<string, unknown>;

const USAGE_SOURCE_VALUES = new Set(['provider', 'estimated']);
const CACHE_STATUS_VALUES = new Set(['hit', 'miss', 'unknown']);

type ConversationStreamEventPayloadEvent = {
  payload?: EventPayload | null;
};

type CompactionEvent = ConversationEvent & {
  payload: EventPayload;
};

export type CompactionDebugInfo = {
  reason: string | null;
  strategy: string | null;
  beforeTokens: number | null;
  afterTokens: number | null;
  removedMessages: number | null;
  summaryPreview: string | null;
  summaryText: string | null;
  replacementHistoryPreview: Array<{
    role: string | null;
    messageType: string | null;
    content: string | null;
    toolName: string | null;
    toolCallId: string | null;
  }>;
  skippedReason: string | null;
};

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordOrNull(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function finiteNumberField(payload: EventPayload, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nullableNumberField(payload: EventPayload, key: string): number | null | undefined {
  if (payload[key] === null) {
    return null;
  }
  return finiteNumberField(payload, key);
}

function booleanField(payload: EventPayload, key: string): boolean | null | undefined {
  if (payload[key] === null) {
    return null;
  }
  return typeof payload[key] === 'boolean' ? payload[key] as boolean : undefined;
}

function resolveConversationStreamEventPayload(
  event: ConversationStreamEventPayloadEvent | null | undefined,
): EventPayload | null {
  return recordOrNull(event?.payload);
}

function resolveConversationStreamEventUserId(
  event: ConversationStreamEventPayloadEvent | null | undefined,
): string | null {
  return optionalString(resolveConversationStreamEventPayload(event)?.userId);
}

function buildTokenCountsFromPayload(payload: EventPayload | null | undefined): TokenCounts {
  const source = payload ?? {};
  const tokenCounts: TokenCounts = {};
  const promptTokens = finiteNumberField(source, 'prompt_tokens');
  const visibleOutputTokens = finiteNumberField(source, 'visible_output_tokens');
  const thinkingTokens = nullableNumberField(source, 'thinking_tokens');
  const outputTokensTotal = finiteNumberField(source, 'output_tokens_total');
  const totalTokens = finiteNumberField(source, 'total_tokens');
  const conversationTokens = finiteNumberField(source, 'conversation_tokens');
  const cachedTokens = nullableNumberField(source, 'cached_tokens');
  const cacheHit = booleanField(source, 'cache_hit');
  const usageSource = typeof source.usage_source === 'string' && USAGE_SOURCE_VALUES.has(source.usage_source)
    ? source.usage_source as TokenCounts['usage_source']
    : undefined;
  const cacheStatus = typeof source.cache_status === 'string' && CACHE_STATUS_VALUES.has(source.cache_status)
    ? source.cache_status as TokenCounts['cache_status']
    : undefined;

  if (promptTokens !== undefined) {
    tokenCounts.prompt_tokens = promptTokens;
  }
  if (visibleOutputTokens !== undefined) {
    tokenCounts.visible_output_tokens = visibleOutputTokens;
  }
  if (thinkingTokens !== undefined) {
    tokenCounts.thinking_tokens = thinkingTokens;
  }
  if (outputTokensTotal !== undefined) {
    tokenCounts.output_tokens_total = outputTokensTotal;
  }
  if (totalTokens !== undefined) {
    tokenCounts.total_tokens = totalTokens;
  }
  if (conversationTokens !== undefined) {
    tokenCounts.conversation_tokens = conversationTokens;
  }
  if (usageSource !== undefined) {
    tokenCounts.usage_source = usageSource;
  }
  if (cachedTokens !== undefined) {
    tokenCounts.cached_tokens = cachedTokens;
  }
  if (cacheHit !== undefined) {
    tokenCounts.cache_hit = cacheHit;
  }
  if (cacheStatus !== undefined) {
    tokenCounts.cache_status = cacheStatus;
  }

  return tokenCounts;
}

function resolveTerminalErrorPayload(payload: EventPayload | null | undefined): ErrorPayload {
  return {
    message: payload?.message,
    content: payload?.content,
  };
}

function resolveLocalUserMessageText(payload: EventPayload | null | undefined): string | null {
  return stringOrNull(payload?.text) ?? stringOrNull(payload?.content);
}

function resolveToolSchemasMetadataPayload(payload: EventPayload | null | undefined): EventPayload {
  return {
    ...(payload ?? {}),
    tool_schemas: payload?.tool_schemas ?? payload?.toolSchemas,
  };
}

function resolveCompactionSkippedReason(payload: EventPayload | null | undefined): string {
  return optionalString(payload?.skippedReason)
    ?? optionalString(payload?.skipped_reason)
    ?? '';
}

function resolveCompactionErrorText(payload: EventPayload | null | undefined): string {
  return optionalString(payload?.error) ?? '';
}

function getCompactionReplacementHistoryEntries(
  payload: EventPayload | null | undefined,
): JsonRecord[] {
  return arrayOrEmpty(
    payload?.entries ?? payload?.replacementHistoryEntries ?? payload?.replacement_history_entries,
  ).map(recordOrNull).filter((entry): entry is JsonRecord => Boolean(entry));
}

function hasCompactionReplacementHistoryEntries(
  payload: EventPayload | null | undefined,
): boolean {
  return getCompactionReplacementHistoryEntries(payload).length > 0;
}

function buildCompactionDebugInfo(
  payload: EventPayload | null | undefined,
  skippedReason = resolveCompactionSkippedReason(payload),
): CompactionDebugInfo {
  return {
    reason: stringOrNull(payload?.reason),
    strategy: stringOrNull(payload?.strategy),
    beforeTokens: numberOrNull(payload?.beforeTokens ?? payload?.before_tokens),
    afterTokens: numberOrNull(payload?.afterTokens ?? payload?.after_tokens),
    removedMessages: numberOrNull(payload?.removedMessages ?? payload?.removed_messages),
    summaryPreview: stringOrNull(payload?.summaryPreview ?? payload?.summary_preview),
    summaryText: stringOrNull(payload?.summaryText ?? payload?.summary_text),
    replacementHistoryPreview: arrayOrEmpty(
      payload?.replacementHistoryPreview ?? payload?.replacement_history_preview,
    ).map(recordOrNull).filter((entry): entry is JsonRecord => Boolean(entry)).map((entry) => ({
      role: typeof entry.role === 'string' ? entry.role : null,
      messageType: typeof entry.message_type === 'string' ? entry.message_type : null,
      content: typeof entry.content === 'string' ? entry.content : null,
      toolName: typeof entry.tool_name === 'string' ? entry.tool_name : null,
      toolCallId: typeof entry.tool_call_id === 'string' ? entry.tool_call_id : null,
    })),
    skippedReason: skippedReason || null,
  };
}

function buildCompactedReplaySnapshot(
  event: CompactionEvent,
  conversationRef: string,
): CompactedReplaySnapshot | null {
  const entries = getCompactionReplacementHistoryEntries(event.payload);
  if (entries.length === 0) {
    return null;
  }
  const stableSuffix = optionalString(event.eventId)
    ?? optionalString(event.turnRef)
    ?? `${Date.now()}`;
  return {
    generationId: optionalString(event.payload.generationId) ?? `compaction-${conversationRef}-${stableSuffix}`,
    conversationRef,
    sourceRevisionId: optionalString(event.revisionId) ?? `rev-compaction-${conversationRef}-${stableSuffix}`,
    sourceTurnRef: optionalString(event.turnRef),
    createdAt: event.timestamp,
    entries,
    entryCount: entries.length,
    complete: true,
    active: true,
  };
}

function resolveCompactionUserId(payload: EventPayload | null | undefined): string {
  return optionalString(payload?.userId) || 'default_user';
}

function shouldIgnoreStreamError(payload: ErrorPayload | null | undefined): boolean {
  const message = payload?.message;
  const content = payload?.content;
  const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : '';
  const normalizedContent = typeof content === 'string' ? content.toLowerCase() : '';
  const isRecoverableToolParseError = RECOVERABLE_TOOL_PARSE_ERROR_MARKERS.every((marker) => (
    normalizedMessage.includes(marker) || normalizedContent.includes(marker)
  ));
  return (
    isSettingsUpdateErrorPayload(payload)
    || isRecoverableToolParseError
  );
}

function resolveErrorText(payload: ErrorPayload | null | undefined): string {
  const content = payload?.content;
  if (typeof content === 'string' && content.length > 0) {
    return content;
  }
  const message = payload?.message;
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }
  return 'An error occurred';
}

export const DesktopChatStreamEventPayloadRuntime = Object.freeze({
  resolveConversationStreamEventPayload,
  resolveConversationStreamEventUserId,
  buildTokenCountsFromPayload,
  resolveTerminalErrorPayload,
  resolveLocalUserMessageText,
  resolveToolSchemasMetadataPayload,
  resolveCompactionSkippedReason,
  resolveCompactionErrorText,
  getCompactionReplacementHistoryEntries,
  hasCompactionReplacementHistoryEntries,
  buildCompactionDebugInfo,
  buildCompactedReplaySnapshot,
  resolveCompactionUserId,
  shouldIgnoreStreamError,
  resolveErrorText,
});
