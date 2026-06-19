/**
 * Normalizes renderer chat stream event payloads for UI side effects.
 */

import { DesktopArtifactRuntimeClient } from './desktopArtifactRuntimeClient';
import type {
  CompactedReplaySnapshot,
  ConversationEvent,
  JsonRecord,
} from './desktopConversationRuntimeContracts';

const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';
const RECOVERABLE_TOOL_PARSE_ERROR_MARKERS = [
  'failed to parse streamed tool-call arguments',
  'raw arguments preview:',
];

type ErrorPayload = {
  message?: unknown;
  content?: unknown;
};

type EventPayload = Record<string, unknown>;

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

export function resolveToolSchemasMetadataPayload(payload: EventPayload | null | undefined): EventPayload {
  return {
    ...(payload ?? {}),
    tool_schemas: payload?.tool_schemas ?? payload?.toolSchemas,
  };
}

export function resolveCompactionSkippedReason(payload: EventPayload | null | undefined): string {
  return optionalString(payload?.skippedReason)
    ?? optionalString(payload?.skipped_reason)
    ?? '';
}

export function getCompactionReplacementHistoryEntries(
  payload: EventPayload | null | undefined,
): JsonRecord[] {
  return arrayOrEmpty(
    payload?.entries ?? payload?.replacementHistoryEntries ?? payload?.replacement_history_entries,
  ).map(recordOrNull).filter((entry): entry is JsonRecord => Boolean(entry));
}

export function hasCompactionReplacementHistoryEntries(
  payload: EventPayload | null | undefined,
): boolean {
  return getCompactionReplacementHistoryEntries(payload).length > 0;
}

export function buildCompactionDebugInfo(
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

export function buildCompactedReplaySnapshot(
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

export function resolveCompactionUserId(payload: EventPayload | null | undefined): string {
  return optionalString(payload?.userId) || 'default_user';
}

export function shouldIgnoreStreamError(payload: ErrorPayload | null | undefined): boolean {
  const message = payload?.message;
  const content = payload?.content;
  const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : '';
  const normalizedContent = typeof content === 'string' ? content.toLowerCase() : '';
  const isRecoverableToolParseError = RECOVERABLE_TOOL_PARSE_ERROR_MARKERS.every((marker) => (
    normalizedMessage.includes(marker) || normalizedContent.includes(marker)
  ));
  return (
    (typeof message === 'string' && message.includes(SETTINGS_UPDATE_ERROR_TEXT))
    || (typeof content === 'string' && content.includes(SETTINGS_UPDATE_ERROR_TEXT))
    || isRecoverableToolParseError
  );
}

export function buildScreenshotAttachment(
  screenshotRef: string | null | undefined,
  screenshotUrl?: string | null,
) {
  return DesktopArtifactRuntimeClient.buildRemoteScreenshotAttachment(screenshotRef, screenshotUrl);
}

export function resolveErrorText(payload: ErrorPayload | null | undefined): string {
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
