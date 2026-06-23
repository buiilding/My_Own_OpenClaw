/**
 * Builds backend rehydrate payloads from SDK model-history checkpoints.
 */

import type {
  JsonRecord,
  ModelHistoryCheckpoint,
  ModelHistoryRow,
  RehydrateSnapshot,
} from '../conversation/types.js';

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeImageRefs(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(entry => (
        typeof entry === 'string'
        && entry.trim()
        && !entry.trim().toLowerCase().startsWith('data:')
      ))
    : [];
}

export function modelHistoryPayloadFromCheckpoint(checkpoint: ModelHistoryCheckpoint): JsonRecord {
  return {
    checkpoint_id: checkpoint.checkpointId,
    revision_id: checkpoint.revisionId,
    created_at: checkpoint.createdAt,
    rows: checkpoint.rows.map(row => ({
      id: row.id,
      conversation_ref: row.conversationRef,
      revision_id: row.revisionId,
      role: row.role,
      message_type: row.messageType,
      content: row.content,
      tool_call_id: row.toolCallId ?? null,
      tool_calls: Array.isArray(row.toolCalls) ? row.toolCalls.filter(isJsonRecord) : null,
      tool_name: row.toolName ?? null,
      image_refs: safeImageRefs(row.imageRefs),
      compaction_facts: isJsonRecord(row.compactionFacts) ? row.compactionFacts : null,
      source_display_row_ids: Array.isArray(row.sourceDisplayRowIds)
        ? row.sourceDisplayRowIds.filter(value => typeof value === 'string' && value.trim())
        : [],
    })),
  };
}

function rehydrateMessageFromModelHistoryRow(row: ModelHistoryRow): JsonRecord {
  const imageRefs = safeImageRefs(row.imageRefs);
  return {
    role: row.role,
    message_type: row.messageType,
    content: row.content,
    ...(row.toolCallId ? { tool_call_id: row.toolCallId } : {}),
    ...(Array.isArray(row.toolCalls) ? { tool_calls: row.toolCalls.filter(isJsonRecord) } : {}),
    ...(row.toolName ? { tool_name: row.toolName } : {}),
    ...(imageRefs.length > 0 ? { screenshot_ref: imageRefs[0] } : {}),
  };
}

export function rehydrateSnapshotFromModelHistoryCheckpoint(
  checkpoint: ModelHistoryCheckpoint,
): RehydrateSnapshot | null {
  if (checkpoint.rows.length === 0) {
    return null;
  }
  return {
    conversationRef: checkpoint.conversationRef,
    revisionId: checkpoint.revisionId,
    messages: checkpoint.rows.map(rehydrateMessageFromModelHistoryRow),
  };
}
