/**
 * Builds store-backed display projections from active display timeline checkpoints.
 */

import type {
  ConversationEvent,
  DisplayConversation,
  DisplayMessage,
  DisplayTimelineCheckpoint,
  DisplayTimelineRow,
  JsonRecord,
  SdkDisplayRow,
} from '../conversation/types.js';
import {
  buildCompactionState,
  buildDisplayRows,
} from '../projections/conversationProjections.js';
import { resolveToolOutputDedupeKey } from '../tools/toolCorrelationIds.js';
import { readToolOutputContent } from '../tools/toolOutputContent.js';

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rowRevisionId(row: DisplayTimelineRow | SdkDisplayRow): string | null {
  const explicit = (row as Partial<DisplayTimelineRow>).revisionId;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }
  const metadataRevision = row.metadata?.revisionId;
  return typeof metadataRevision === 'string' && metadataRevision.trim()
    ? metadataRevision.trim()
    : null;
}

function displayRowToolOutputDedupeKey(row: DisplayTimelineRow | SdkDisplayRow): string | null {
  if (row.type !== 'tool_output' && row.type !== 'tool_bundle_output') {
    return null;
  }
  const raw = isJsonRecord(row.metadata?.raw) ? row.metadata.raw : null;
  const rawKey = raw ? resolveToolOutputDedupeKey(raw) : null;
  if (rawKey) {
    return rawKey;
  }
  const requestId = typeof row.metadata?.requestId === 'string' && row.metadata.requestId.trim()
    ? row.metadata.requestId.trim()
    : null;
  if (requestId) {
    return `request:${requestId}`;
  }
  const correlationId = typeof row.metadata?.correlationId === 'string' && row.metadata.correlationId.trim()
    ? row.metadata.correlationId.trim()
    : null;
  if (correlationId) {
    return `request:${correlationId}`;
  }
  const bundleId = typeof row.metadata?.bundleId === 'string' && row.metadata.bundleId.trim()
    ? row.metadata.bundleId.trim()
    : null;
  if (bundleId) {
    return `bundle:${bundleId}`;
  }
  const toolCallId = typeof row.metadata?.toolCallId === 'string' && row.metadata.toolCallId.trim()
    ? row.metadata.toolCallId.trim()
    : null;
  return toolCallId ? `tool-call:${toolCallId}` : null;
}

function displayRowHasModelContent(row: DisplayTimelineRow | SdkDisplayRow): boolean {
  const raw = isJsonRecord(row.metadata?.raw) ? row.metadata.raw : null;
  if (raw) {
    return readToolOutputContent(raw).hasModelContent;
  }
  return typeof row.content === 'string' && row.content.trim().length > 0;
}

function displayRowSource(row: DisplayTimelineRow | SdkDisplayRow): string | null {
  const source = row.metadata?.source;
  return typeof source === 'string' && source.trim() ? source.trim() : null;
}

function withoutDuplicateDisplayToolOutputs<T extends DisplayTimelineRow | SdkDisplayRow>(rows: T[]): T[] {
  const preferredRows = new Map<string, T>();
  const prefers = (candidate: T, current: T): boolean => {
    const candidateHasModelContent = displayRowHasModelContent(candidate);
    const currentHasModelContent = displayRowHasModelContent(current);
    if (candidateHasModelContent !== currentHasModelContent) {
      return candidateHasModelContent;
    }
    if (displayRowSource(candidate) === 'backend' && displayRowSource(current) !== 'backend') {
      return true;
    }
    if (displayRowSource(candidate) !== 'backend' && displayRowSource(current) === 'backend') {
      return false;
    }
    return false;
  };
  for (const row of rows) {
    const key = displayRowToolOutputDedupeKey(row);
    if (!key) {
      continue;
    }
    const current = preferredRows.get(key);
    if (!current || prefers(row, current)) {
      preferredRows.set(key, row);
    }
  }
  return rows
    .filter(row => {
      const key = displayRowToolOutputDedupeKey(row);
      return !key || preferredRows.get(key) === row;
    })
    .map((row, index) => ({ ...row, index }));
}

function displayMessageFromRow(row: SdkDisplayRow, fallbackTimestamp: string): DisplayMessage | null {
  const metadata = isJsonRecord(row.metadata) ? row.metadata : {};
  const messageType = row.type === 'error'
    ? 'turn_error'
    : row.type === 'reasoning'
      ? null
      : row.type;
  if (!messageType) {
    return null;
  }
  const text = typeof row.content === 'string'
    ? row.content
    : row.content == null
      ? ''
      : JSON.stringify(row.content);
  if (!text && row.role === 'system') {
    return null;
  }
  return {
    id: row.id,
    conversationRef: row.conversationRef,
    turnRef: row.turnRef ?? null,
    revisionId: rowRevisionId(row) ?? '',
    timestamp: typeof metadata.timestamp === 'string' ? metadata.timestamp : fallbackTimestamp,
    sender: row.role,
    text,
    messageType,
    toolName: typeof metadata.toolName === 'string' ? metadata.toolName : null,
    requestId: typeof metadata.requestId === 'string' ? metadata.requestId : null,
    bundleId: typeof metadata.bundleId === 'string' ? metadata.bundleId : null,
    toolCallId: typeof metadata.toolCallId === 'string' ? metadata.toolCallId : null,
    correlationId: typeof metadata.correlationId === 'string' ? metadata.correlationId : null,
    metadata,
  };
}

export function displayRowsFromTimeline(
  timeline: DisplayTimelineCheckpoint,
  events: ConversationEvent[],
): SdkDisplayRow[] {
  const eventRows = buildDisplayRows(events);
  const rowIds = new Set(timeline.rows.map(row => row.id));
  const appendedRows = eventRows.filter(row => (
    rowRevisionId(row) === timeline.revisionId && !rowIds.has(row.id)
  ));
  return withoutDuplicateDisplayToolOutputs([
    ...timeline.rows,
    ...appendedRows.map((row, offset) => ({
      ...row,
      index: timeline.rows.length + offset,
    })),
  ]) as SdkDisplayRow[];
}

export function displayConversationFromTimeline(
  timeline: DisplayTimelineCheckpoint,
  events: ConversationEvent[],
): DisplayConversation {
  const rows = displayRowsFromTimeline(timeline, events);
  const revisionEvents = events.filter(event => event.revisionId === timeline.revisionId);
  return {
    conversationRef: timeline.conversationRef,
    revisionId: timeline.revisionId,
    messages: rows
      .map(row => displayMessageFromRow(row, timeline.createdAt))
      .filter((message): message is DisplayMessage => Boolean(message)),
    compaction: buildCompactionState(revisionEvents),
  };
}
