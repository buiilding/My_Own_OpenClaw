/**
 * Implements local-runtime conversation storage for the TypeScript SDK runtime.
 */

import type {
  AppDiagnosticEventDraft,
  CompactedReplaySnapshot,
  ConversationEvent,
  ConversationMetadata,
  ConversationRevision,
  ConversationStore,
  DisplayTimelineCheckpoint,
  DisplayTimelineRow,
  DisplayConversation,
  JsonRecord,
  ListConversationOptions,
  ModelHistoryCheckpoint,
  ModelHistoryMessageType,
  ModelHistoryRole,
  ModelHistoryRow,
  RehydrateSnapshot,
  SdkDisplayRow,
  SearchConversationOptions,
} from '../conversation/types.js';
import {
  applyConversationMetadataPagination,
  searchConversationMetadata,
} from '../conversation/metadata.js';
import {
  buildDisplayConversation,
  buildDisplayRows,
  buildRehydrateSnapshot,
} from '../projections/conversationProjections.js';
import { isCompactionStdoutEnabled } from '../runtime/debugEnv.js';
import { rehydrateSnapshotFromModelHistoryCheckpoint } from '../runtime/modelHistoryPayload.js';
import type { AgentLocalRuntimeClient } from '../runtime/LocalRuntime.js';
import { latestCompactedReplayFromEvents } from './compactedReplayEvents.js';
import {
  displayConversationFromTimeline,
  displayRowsFromTimeline,
} from './displayTimelineStoreProjection.js';

const CHAT_EVENT_RECORD_KIND = 'chat_event';
const LOCAL_RUNTIME_RPC_DIAGNOSTIC_STAGE = 'local_runtime_rpc';

export type LocalRuntimeConversationStoreEventWriteContext = {
  event: ConversationEvent;
  defaultParams: JsonRecord;
};

export type LocalRuntimeConversationStoreEventWriteParams = (
  context: LocalRuntimeConversationStoreEventWriteContext,
) => JsonRecord | null | undefined;

export type LocalRuntimeConversationStoreOptions = {
  userId: string;
  runtime: Pick<AgentLocalRuntimeClient, 'rpc'>;
  pageSize?: number;
  maxPages?: number;
  eventWriteParams?: LocalRuntimeConversationStoreEventWriteParams;
};

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  const record = normalizeRecord(value);
  if (record) {
    return record;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    return normalizeRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function emitAppDiagnostic(options: ListConversationOptions, event: AppDiagnosticEventDraft): Promise<void> {
  try {
    await options.diagnostics?.emit?.(event);
  } catch {
    // App diagnostics must never make local-runtime conversation reads fail.
  }
}

function serializeDiagnosticsContext(options: ListConversationOptions): JsonRecord | undefined {
  const diagnostics = normalizeRecord(options.diagnostics);
  if (!diagnostics) {
    return undefined;
  }
  return {
    path: normalizeString(diagnostics.path) ?? undefined,
    trace_id: normalizeString(diagnostics.traceId) ?? undefined,
    parent_span_id: normalizeString(diagnostics.parentSpanId) ?? undefined,
    request_id: normalizeString(diagnostics.requestId) ?? undefined,
    session_id: normalizeString(diagnostics.sessionId) ?? undefined,
    conversation_ref: normalizeString(diagnostics.conversationRef) ?? undefined,
  };
}

function normalizeEventCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeConversationEvent(candidate: unknown): ConversationEvent | null {
  const event = normalizeRecord(candidate);
  if (!event) {
    return null;
  }
  if (
    typeof event.eventId !== 'string'
    || typeof event.type !== 'string'
    || typeof event.conversationRef !== 'string'
    || typeof event.revisionId !== 'string'
    || typeof event.timestamp !== 'string'
    || typeof event.source !== 'string'
  ) {
    return null;
  }
  return {
    eventId: event.eventId,
    type: event.type as ConversationEvent['type'],
    conversationRef: event.conversationRef,
    turnRef: typeof event.turnRef === 'string' ? event.turnRef : null,
    revisionId: event.revisionId,
    timestamp: event.timestamp,
    source: event.source as ConversationEvent['source'],
    payload: normalizeRecord(event.payload) ?? {},
  };
}

function storedEventFromRow(row: Record<string, unknown>): ConversationEvent | null {
  const metadata = parseJsonRecord(row.metadata);
  return normalizeConversationEvent(
    parseJsonRecord(row.event_payload)
    ?? parseJsonRecord(row.eventPayload)
    ?? metadata?.agent_sdk_conversation_event
    ?? metadata?.agentSdkConversationEvent,
  );
}

function textFromEvent(event: ConversationEvent): string {
  for (const key of ['text', 'content', 'finalResponse', 'final_response', 'error']) {
    const value = event.payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return `[sdk event: ${event.type}]`;
}

function valueByKeys(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function normalizeJsonArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(normalizeRecord(entry)))
    : [];
}

function normalizeUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? [...value] : [];
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function eventPayloadWriteParams(event: ConversationEvent): JsonRecord {
  const payload = normalizeRecord(event.payload) ?? {};
  const metadata = normalizeRecord(payload.metadata) ?? {};
  const screenshot = valueByKeys(payload, ['screenshotRef', 'screenshot_ref', 'screenshotUrl', 'screenshot_url', 'screenshot'])
    ?? valueByKeys(metadata, ['screenshot']);
  return {
    tool_name: valueByKeys(payload, ['toolName', 'tool_name']) ?? null,
    correlation_id: valueByKeys(payload, ['correlationId', 'correlation_id', 'toolCallId', 'tool_call_id', 'requestId', 'request_id']) ?? null,
    workspace_path: valueByKeys(payload, ['workspacePath', 'workspace_path']) ?? null,
    workspace_name: valueByKeys(payload, ['workspaceName', 'workspace_name']) ?? null,
    metadata: {
      ...metadata,
      model_id: valueByKeys(payload, ['modelId', 'model_id']) ?? metadata.model_id ?? null,
      model_provider: valueByKeys(payload, ['modelProvider', 'model_provider']) ?? metadata.model_provider ?? null,
      screenshot: screenshot ?? null,
    },
    attachments: normalizeJsonArray(payload.attachments),
    compaction_checkpoint: event.type === 'compaction_applied' ? event.payload : null,
  };
}

function roleFromEvent(event: ConversationEvent): string {
  if (event.type === 'user_message') {
    return 'user';
  }
  if (event.type === 'tool_output' || event.type === 'tool_bundle_output') {
    return 'tool';
  }
  return 'assistant';
}

function isCompactionEvent(event: ConversationEvent): boolean {
  return event.type.startsWith('compaction_');
}

function responseMessageIndex(response: Record<string, unknown>): number | null {
  const data = normalizeRecord(response.data);
  const value = data?.message_index ?? data?.messageIndex;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function logStoredCompactionEvent(
  event: ConversationEvent,
  params: JsonRecord,
  response: Record<string, unknown>,
): void {
  if (!isCompactionStdoutEnabled()) {
    return;
  }
  const payload = normalizeRecord(event.payload) ?? {};
  console.log('[Agent SDK][Compaction] conversation.append_event succeeded', {
    conversationRef: event.conversationRef,
    turnRef: event.turnRef,
    revisionId: event.revisionId,
    eventId: event.eventId,
    eventType: event.type,
    source: event.source,
    userId: normalizeString(params.user_id),
    producer: normalizeString(params.producer),
    producerEventId: normalizeString(params.producer_event_id),
    producerSequence: typeof params.producer_sequence === 'number' ? params.producer_sequence : null,
    messageIndex: responseMessageIndex(response),
    generationId: normalizeString(payload.generationId),
    skippedReason: normalizeString(payload.skippedReason),
    hasCompactionCheckpoint: Boolean(params.compaction_checkpoint),
  });
}

function metadataFromRow(row: Record<string, unknown>): ConversationMetadata | null {
  const conversationRef = normalizeString(row.conversation_id);
  if (!conversationRef) {
    return null;
  }
  return {
    conversationRef,
    revisionId: normalizeString(row.revision_id) ?? `rev-stored-${conversationRef}`,
    title: normalizeString(row.title) ?? conversationRef,
    lastMessage: normalizeString(row.last_message),
    updatedAt: normalizeString(row.last_timestamp)
      ?? new Date(0).toISOString(),
    eventCount: normalizeEventCount(row.entry_count),
    workspacePath: normalizeString(row.workspace_path),
    workspaceName: normalizeString(row.workspace_name),
    snippet: normalizeString(row.snippet),
    matchedRole: normalizeString(row.matched_role),
  };
}

function normalizeModelHistoryRole(value: unknown): ModelHistoryRole | null {
  return value === 'system'
    || value === 'user'
    || value === 'assistant'
    || value === 'tool'
    ? value
    : null;
}

function normalizeModelHistoryMessageType(value: unknown): ModelHistoryMessageType | null {
  return value === 'user_query'
    || value === 'assistant_response'
    || value === 'tool_output'
    || value === 'context_compaction'
    ? value
    : null;
}

function modelHistoryRowFromRuntime(row: unknown): ModelHistoryRow | null {
  const record = normalizeRecord(row);
  if (!record) {
    return null;
  }
  const id = normalizeString(record.id ?? record.row_id ?? record.rowId);
  const conversationRef = normalizeString(record.conversationRef ?? record.conversation_id ?? record.conversationId);
  const revisionId = normalizeString(record.revisionId ?? record.revision_id);
  const role = normalizeModelHistoryRole(record.role);
  const messageType = normalizeModelHistoryMessageType(record.messageType ?? record.message_type);
  if (!id || !conversationRef || !revisionId || !role || !messageType) {
    return null;
  }
  return {
    id,
    conversationRef,
    revisionId,
    role,
    messageType,
    content: record.content,
    toolCallId: normalizeString(record.toolCallId ?? record.tool_call_id),
    toolCalls: normalizeUnknownArray(record.toolCalls ?? record.tool_calls),
    toolName: normalizeString(record.toolName ?? record.tool_name),
    imageRefs: normalizeStringArray(record.imageRefs ?? record.image_refs),
    compactionFacts: normalizeRecord(record.compactionFacts ?? record.compaction_facts),
    sourceDisplayRowIds: normalizeStringArray(record.sourceDisplayRowIds ?? record.source_display_row_ids),
  };
}

function displayTimelineRowFromRuntime(row: unknown): DisplayTimelineRow | null {
  const record = normalizeRecord(row);
  if (!record) {
    return null;
  }
  const id = normalizeString(record.id ?? record.row_id ?? record.rowId);
  const conversationRef = normalizeString(record.conversationRef ?? record.conversation_id ?? record.conversationId);
  const revisionId = normalizeString(record.revisionId ?? record.revision_id);
  const role = normalizeString(record.role);
  const type = normalizeString(record.type ?? record.row_type ?? record.rowType);
  const indexValue = record.index ?? record.row_index ?? record.rowIndex;
  const index = typeof indexValue === 'number' && Number.isFinite(indexValue)
    ? indexValue
    : Number(indexValue);
  if (!id || !conversationRef || !revisionId || !role || !type || !Number.isFinite(index)) {
    return null;
  }
  return {
    id,
    conversationRef,
    revisionId,
    turnRef: normalizeString(record.turnRef ?? record.turn_ref),
    index,
    role,
    type,
    content: record.content,
    metadata: normalizeRecord(record.metadata) ?? undefined,
  } as DisplayTimelineRow;
}

export class LocalRuntimeConversationStore implements ConversationStore {
  private readonly pageSize: number;
  private readonly maxPages: number;

  constructor(private readonly options: LocalRuntimeConversationStoreOptions) {
    this.pageSize = options.pageSize ?? 1000;
    this.maxPages = options.maxPages ?? 250;
  }

  async appendEvent(event: ConversationEvent): Promise<void> {
    await this.appendEvents([event]);
  }

  async appendEvents(events: ConversationEvent[]): Promise<void> {
    for (const event of events) {
      const params = this.buildEventWriteParams(event);
      const response = await this.call('conversation.append_event', params);
      if (isCompactionEvent(event)) {
        logStoredCompactionEvent(event, params, response);
      }
    }
  }

  async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
    if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
      return;
    }
    await this.appendEvent({
      eventId: `compaction-${snapshot.generationId}`,
      type: 'compaction_applied',
      conversationRef: snapshot.conversationRef,
      revisionId: snapshot.sourceRevisionId,
      turnRef: snapshot.sourceTurnRef ?? null,
      timestamp: snapshot.createdAt,
      source: 'sdk',
      payload: {
        ...snapshot,
        active: true,
      },
    });
  }

  async loadEvents(conversationRef: string): Promise<ConversationEvent[]> {
    const rows: Record<string, unknown>[] = [];
    let afterMessageIndex: number | null = null;
    for (let page = 0; page < this.maxPages; page += 1) {
      const result = await this.call('conversation.load_events', {
        user_id: this.options.userId,
        conversation_id: conversationRef,
        record_kind: CHAT_EVENT_RECORD_KIND,
        limit: this.pageSize,
        after_message_index: afterMessageIndex,
      });
      const data = normalizeRecord(result.data) ?? {};
      const entries = Array.isArray(data.events) ? data.events : [];
      if (entries.length === 0) {
        break;
      }
      rows.push(...entries.filter((entry): entry is Record<string, unknown> => Boolean(normalizeRecord(entry))));
      if (entries.length < this.pageSize) {
        break;
      }
      const last = normalizeRecord(entries[entries.length - 1]);
      const nextIndex = Number(last?.message_index);
      if (!Number.isFinite(nextIndex) || nextIndex === afterMessageIndex) {
        break;
      }
      afterMessageIndex = nextIndex;
    }
    return rows.map(storedEventFromRow).filter((event): event is ConversationEvent => Boolean(event));
  }

  async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
    const events = await this.loadEvents(conversationRef);
    const timeline = await this.loadDisplayTimeline({ conversationRef });
    if (!timeline) {
      return buildDisplayConversation(events);
    }
    return displayConversationFromTimeline(timeline, events);
  }

  async loadDisplayRows(conversationRef: string): Promise<SdkDisplayRow[]> {
    const events = await this.loadEvents(conversationRef);
    const timeline = await this.loadDisplayTimeline({ conversationRef });
    if (!timeline) {
      return buildDisplayRows(events);
    }
    return displayRowsFromTimeline(timeline, events);
  }

  async replaceDisplayTimeline(checkpoint: DisplayTimelineCheckpoint): Promise<void> {
    await this.call('conversation.display.replace', {
      user_id: this.options.userId,
      conversation_id: checkpoint.conversationRef,
      revision_id: checkpoint.revisionId,
      created_at: checkpoint.createdAt,
      reason: checkpoint.reason ?? null,
      base_revision_id: checkpoint.baseRevisionId ?? null,
      rows: checkpoint.rows.map((row, index) => ({
        id: row.id,
        row_id: row.id,
        conversation_id: row.conversationRef,
        revision_id: row.revisionId,
        row_index: index,
        role: row.role,
        type: row.type,
        row_type: row.type,
        content: row.content,
        turn_ref: row.turnRef ?? null,
        metadata: row.metadata ?? null,
      })),
    });
  }

  async loadDisplayTimeline(input: {
    conversationRef: string;
    revisionId?: string | null;
  }): Promise<DisplayTimelineCheckpoint | null> {
    const result = await this.call('conversation.display.load', {
      user_id: this.options.userId,
      conversation_id: input.conversationRef,
      revision_id: input.revisionId ?? null,
    });
    const data = normalizeRecord(result.data) ?? {};
    const revisionId = normalizeString(data.revision_id ?? data.revisionId);
    const createdAt = normalizeString(data.created_at ?? data.createdAt);
    const rows = Array.isArray(data.rows)
      ? data.rows.map(displayTimelineRowFromRuntime).filter((row): row is DisplayTimelineRow => Boolean(row))
      : [];
    if (!revisionId || !createdAt) {
      return null;
    }
    return {
      conversationRef: input.conversationRef,
      revisionId,
      createdAt,
      rows,
      reason: normalizeString(data.reason) as DisplayTimelineCheckpoint['reason'],
      baseRevisionId: normalizeString(data.base_revision_id ?? data.baseRevisionId),
    };
  }

  async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
    const revision = await this.getRevision(conversationRef).catch(() => null);
    const modelHistoryCheckpoint = await this.loadModelHistory({
      conversationRef,
      revisionId: revision?.revisionId && revision.revisionId !== 'rev-empty' ? revision.revisionId : null,
    });
    const modelHistorySnapshot = modelHistoryCheckpoint
      ? rehydrateSnapshotFromModelHistoryCheckpoint(modelHistoryCheckpoint)
      : null;
    if (modelHistorySnapshot) {
      return modelHistorySnapshot;
    }
    const events = await this.loadEvents(conversationRef);
    const replay = latestCompactedReplayFromEvents(events);
    if (replay?.complete && replay.active !== false && replay.entryCount === replay.entries.length) {
      return {
        conversationRef,
        revisionId: replay.sourceRevisionId,
        messages: replay.entries,
        replayGenerationId: replay.generationId,
      };
    }
    return buildRehydrateSnapshot(events);
  }

  async replaceModelHistory(checkpoint: ModelHistoryCheckpoint): Promise<void> {
    await this.call('conversation.model_history.replace', {
      user_id: this.options.userId,
      conversation_id: checkpoint.conversationRef,
      revision_id: checkpoint.revisionId,
      checkpoint_id: checkpoint.checkpointId,
      created_at: checkpoint.createdAt,
      rows: checkpoint.rows.map((row, index) => ({
        id: row.id,
        row_id: row.id,
        row_index: index + 1,
        conversation_id: row.conversationRef,
        revision_id: row.revisionId,
        role: row.role,
        message_type: row.messageType,
        content: row.content,
        tool_call_id: row.toolCallId ?? null,
        tool_calls: row.toolCalls ?? null,
        tool_name: row.toolName ?? null,
        image_refs: row.imageRefs ?? null,
        compaction_facts: row.compactionFacts ?? null,
        source_display_row_ids: row.sourceDisplayRowIds ?? [],
      })),
    });
  }

  async loadModelHistory(input: {
    conversationRef: string;
    revisionId?: string | null;
  }): Promise<ModelHistoryCheckpoint | null> {
    const result = await this.call('conversation.model_history.load', {
      user_id: this.options.userId,
      conversation_id: input.conversationRef,
      revision_id: input.revisionId ?? null,
    });
    const data = normalizeRecord(result.data) ?? {};
    const checkpointId = normalizeString(data.checkpoint_id ?? data.checkpointId);
    const revisionId = normalizeString(data.revision_id ?? data.revisionId);
    const createdAt = normalizeString(data.created_at ?? data.createdAt);
    const rows = Array.isArray(data.rows)
      ? data.rows.map(modelHistoryRowFromRuntime).filter((row): row is ModelHistoryRow => Boolean(row))
      : [];
    if (!checkpointId || !revisionId || !createdAt) {
      return null;
    }
    return {
      checkpointId,
      conversationRef: input.conversationRef,
      revisionId,
      createdAt,
      rows,
    };
  }

  async listMetadata(options: ListConversationOptions = {}): Promise<ConversationMetadata[]> {
    const startedAt = Date.now();
    await emitAppDiagnostic(options, {
      stage: LOCAL_RUNTIME_RPC_DIAGNOSTIC_STAGE,
      status: 'started',
      runtime: 'sdk',
      data: {
        limit: options.limit,
      },
    });
    try {
      const result = await this.call('conversation.list', {
        user_id: this.options.userId,
        record_kind: CHAT_EVENT_RECORD_KIND,
        limit: options.cursor ? undefined : options.limit,
        diagnostics: serializeDiagnosticsContext(options),
      });
      const data = normalizeRecord(result.data) ?? {};
      const diagnostics = normalizeRecord(data.diagnostics);
      const localRuntimeEvents = Array.isArray(diagnostics?.events) ? diagnostics.events : [];
      for (const event of localRuntimeEvents) {
        const draft = normalizeRecord(event);
        if (!draft) {
          continue;
        }
        await emitAppDiagnostic(options, {
          stage: normalizeString(draft.stage) ?? 'local_runtime',
          status: (normalizeString(draft.status) ?? 'succeeded') as AppDiagnosticEventDraft['status'],
          runtime: 'local-runtime',
          durationMs: typeof draft.durationMs === 'number' ? draft.durationMs : null,
          data: normalizeRecord(draft.data) ?? {},
          error: draft.error,
        });
      }
      const metadata = (Array.isArray(data.conversations) ? data.conversations : [])
        .map(row => metadataFromRow(normalizeRecord(row) ?? {}))
        .filter((entry): entry is ConversationMetadata => Boolean(entry))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      await emitAppDiagnostic(options, {
        stage: LOCAL_RUNTIME_RPC_DIAGNOSTIC_STAGE,
        status: 'succeeded',
        runtime: 'sdk',
        durationMs: Date.now() - startedAt,
        data: {
          limit: options.limit,
          resultCount: metadata.length,
        },
      });
      return applyConversationMetadataPagination(metadata, options);
    } catch (error) {
      await emitAppDiagnostic(options, {
        stage: LOCAL_RUNTIME_RPC_DIAGNOSTIC_STAGE,
        status: 'failed',
        runtime: 'sdk',
        durationMs: Date.now() - startedAt,
        data: {
          limit: options.limit,
        },
        error,
      });
      throw error;
    }
  }

  async searchMetadata(options: SearchConversationOptions): Promise<ConversationMetadata[]> {
    const result = await this.call('conversation.search', {
      user_id: this.options.userId,
      record_kind: CHAT_EVENT_RECORD_KIND,
      query: options.query,
      limit: options.cursor ? undefined : options.limit,
    });
    const data = normalizeRecord(result.data) ?? {};
    const metadata = (Array.isArray(data.conversations) ? data.conversations : [])
      .map(row => metadataFromRow(normalizeRecord(row) ?? {}))
      .filter((entry): entry is ConversationMetadata => Boolean(entry));
    return searchConversationMetadata(metadata, options);
  }

  async deleteConversation(conversationRef: string): Promise<void> {
    await this.call('conversation.delete', {
      user_id: this.options.userId,
      conversation_id: conversationRef,
      record_kind: CHAT_EVENT_RECORD_KIND,
    });
  }

  async clearConversations(): Promise<void> {
    await this.call('clear_chat_history', {
      user_id: this.options.userId,
      record_kind: CHAT_EVENT_RECORD_KIND,
    });
  }

  async getRevision(conversationRef: string): Promise<ConversationRevision> {
    const result = await this.call('conversation.get_revision', {
      user_id: this.options.userId,
      conversation_id: conversationRef,
      record_kind: CHAT_EVENT_RECORD_KIND,
    });
    const revision = normalizeRecord(result.data) ?? {};
    const revisionId = normalizeString(revision.revision_id) ?? normalizeString(revision.revisionId);
    if (revisionId) {
      const operation = normalizeString(revision.operation);
      return {
        conversationRef,
        revisionId,
        parentRevisionId: normalizeString(revision.parent_revision_id)
          ?? normalizeString(revision.parentRevisionId),
        operation: operation === 'send'
          || operation === 'edit'
          || operation === 'retry'
          || operation === 'fork'
          || operation === 'compact'
          || operation === 'manual_rewrite'
          ? operation
          : null,
        displayTimelineId: normalizeString(revision.display_timeline_id)
          ?? normalizeString(revision.displayTimelineId),
        modelHistoryCheckpointId: normalizeString(revision.model_history_checkpoint_id)
          ?? normalizeString(revision.modelHistoryCheckpointId),
        createdAt: normalizeString(revision.created_at)
          ?? normalizeString(revision.createdAt),
        updatedAt: normalizeString(revision.updated_at)
          ?? normalizeString(revision.updatedAt)
          ?? new Date(0).toISOString(),
        active: typeof revision.active === 'boolean'
          ? revision.active
          : revision.active === 1,
      };
    }
    const events = await this.loadEvents(conversationRef);
    const last = events[events.length - 1];
    return {
      conversationRef,
      revisionId: last?.revisionId ?? `rev-stored-${conversationRef}`,
      updatedAt: last?.timestamp ?? new Date(0).toISOString(),
    };
  }

  async listRevisions(options: { conversationRef: string; limit?: number }): Promise<ConversationRevision[]> {
    const result = await this.call('conversation.revisions.list', {
      user_id: this.options.userId,
      conversation_id: options.conversationRef,
      limit: options.limit,
      record_kind: CHAT_EVENT_RECORD_KIND,
    });
    const data = normalizeRecord(result.data) ?? {};
    const revisions = Array.isArray(data.revisions) ? data.revisions : [];
    return revisions
      .map((entry): ConversationRevision | null => {
        const revision = normalizeRecord(entry) ?? {};
        const revisionId = normalizeString(revision.revision_id) ?? normalizeString(revision.revisionId);
        if (!revisionId) {
          return null;
        }
        const operation = normalizeString(revision.operation);
        return {
          conversationRef: options.conversationRef,
          revisionId,
          parentRevisionId: normalizeString(revision.parent_revision_id)
            ?? normalizeString(revision.parentRevisionId),
          operation: operation === 'send'
            || operation === 'edit'
            || operation === 'retry'
            || operation === 'fork'
            || operation === 'compact'
            || operation === 'manual_rewrite'
            ? operation
            : null,
          displayTimelineId: normalizeString(revision.display_timeline_id)
            ?? normalizeString(revision.displayTimelineId),
          modelHistoryCheckpointId: normalizeString(revision.model_history_checkpoint_id)
            ?? normalizeString(revision.modelHistoryCheckpointId),
          createdAt: normalizeString(revision.created_at)
            ?? normalizeString(revision.createdAt),
          updatedAt: normalizeString(revision.updated_at)
            ?? normalizeString(revision.updatedAt)
            ?? new Date(0).toISOString(),
          active: typeof revision.active === 'boolean'
            ? revision.active
            : revision.active === 1,
        };
      })
      .filter((entry): entry is ConversationRevision => Boolean(entry));
  }

  async loadCompactedReplay(conversationRef: string): Promise<CompactedReplaySnapshot | null> {
    const events = await this.loadEvents(conversationRef);
    return latestCompactedReplayFromEvents(events);
  }

  private async call(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.options.runtime.rpc) {
      throw new Error('LocalRuntimeConversationStore requires a local runtime with rpc support');
    }
    const response = await this.options.runtime.rpc({ method, params });
    if (response.success === false) {
      throw new Error(String(response.error ?? `Local runtime RPC failed: ${method}`));
    }
    return response;
  }

  private buildEventWriteParams(
    event: ConversationEvent,
    messageIndex?: number,
  ): JsonRecord {
    const producerSource = String(event.source);
    const defaultParams: JsonRecord = {
      user_id: this.options.userId,
      conversation_id: event.conversationRef,
      event_type: event.type,
      role: roleFromEvent(event),
      content: textFromEvent(event),
      timestamp: event.timestamp,
      revision_id: event.revisionId,
      turn_ref: event.turnRef ?? null,
      producer: producerSource === 'backend'
        ? 'backend'
        : 'sdk',
      producer_event_id: producerSource === 'backend' ? event.eventId : null,
      producer_sequence: producerSource === 'backend' && typeof event.payload.backendSequence === 'number'
        ? event.payload.backendSequence
        : null,
      event_payload: event,
      record_kind: CHAT_EVENT_RECORD_KIND,
      ...(messageIndex ? { message_index: messageIndex } : {}),
    };
    return {
      ...defaultParams,
      ...eventPayloadWriteParams(event),
      ...(this.options.eventWriteParams?.({
        event,
        defaultParams: { ...defaultParams },
      }) ?? {}),
    };
  }
}
