/**
 * Builds backend rehydrate payloads from SDK model-history checkpoints.
 */

import type {
  JsonRecord,
  ModelHistoryCheckpoint,
} from '../conversation/types.js';

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
      image_refs: Array.isArray(row.imageRefs)
        ? row.imageRefs.filter(value => typeof value === 'string' && value.trim() && !value.trim().toLowerCase().startsWith('data:'))
        : [],
      compaction_facts: isJsonRecord(row.compactionFacts) ? row.compactionFacts : null,
      source_display_row_ids: Array.isArray(row.sourceDisplayRowIds)
        ? row.sourceDisplayRowIds.filter(value => typeof value === 'string' && value.trim())
        : [],
    })),
  };
}
