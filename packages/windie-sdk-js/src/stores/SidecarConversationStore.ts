import type {
  CompactedReplaySnapshot,
  ConversationEvent,
  ConversationMetadata,
  ConversationRevision,
  ConversationRewritePlan,
  ConversationStore,
  DisplayConversation,
  ListConversationOptions,
  RehydrateSnapshot,
  SearchConversationOptions,
} from '../conversation/types.js';
import {
  applyConversationMetadataPagination,
  searchConversationMetadata,
} from '../conversation/metadata.js';
import {
  buildDisplayConversation,
  buildRehydrateSnapshot,
} from '../projections/conversationProjections.js';
import type { WindieLocalRuntimeClient } from '../runtime/LocalSidecarRuntime.js';

const CHAT_EVENT_RECORD_KIND = 'chat_event';

export type SidecarConversationStoreOptions = {
  userId: string;
  runtime: Pick<WindieLocalRuntimeClient, 'rpc'>;
  pageSize?: number;
  maxPages?: number;
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
  return normalizeConversationEvent(
    parseJsonRecord(row.event_payload)
    ?? parseJsonRecord(row.eventPayload)
    ?? parseJsonRecord(row.metadata)?.windie_sdk_conversation_event
    ?? parseJsonRecord(row.metadata)?.windieSdkConversationEvent,
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

function roleFromEvent(event: ConversationEvent): string {
  if (event.type === 'user_message') {
    return 'user';
  }
  if (event.type === 'tool_output' || event.type === 'tool_bundle_output') {
    return 'tool';
  }
  return 'assistant';
}

function compactedReplayFromEvent(event: ConversationEvent): CompactedReplaySnapshot | null {
  if (event.type !== 'compaction_applied') {
    return null;
  }
  const entries = Array.isArray(event.payload.entries) ? event.payload.entries : [];
  const generationId = normalizeString(event.payload.generationId) ?? event.eventId;
  return {
    generationId,
    conversationRef: event.conversationRef,
    sourceRevisionId: normalizeString(event.payload.sourceRevisionId) ?? event.revisionId,
    sourceTurnRef: normalizeString(event.payload.sourceTurnRef) ?? event.turnRef ?? null,
    createdAt: normalizeString(event.payload.createdAt) ?? event.timestamp,
    entries: entries.filter((entry): entry is Record<string, unknown> => Boolean(normalizeRecord(entry))),
    entryCount: Number(event.payload.entryCount ?? entries.length),
    complete: event.payload.complete !== false,
    active: event.payload.active !== false,
  };
}

function metadataFromRow(row: Record<string, unknown>): ConversationMetadata | null {
  const conversationRef = normalizeString(row.conversation_id)
    ?? normalizeString(row.conversationId)
    ?? normalizeString(row.conversation_ref)
    ?? normalizeString(row.conversationRef);
  if (!conversationRef) {
    return null;
  }
  return {
    conversationRef,
    revisionId: normalizeString(row.revision_id) ?? normalizeString(row.revisionId) ?? `rev-stored-${conversationRef}`,
    title: normalizeString(row.title) ?? conversationRef,
    lastMessage: normalizeString(row.last_message) ?? normalizeString(row.lastMessage),
    updatedAt: normalizeString(row.last_timestamp)
      ?? normalizeString(row.updatedAt)
      ?? normalizeString(row.timestamp)
      ?? new Date(0).toISOString(),
    eventCount: Number(row.entry_count ?? row.eventCount ?? 0) || 0,
    workspacePath: normalizeString(row.workspace_path) ?? normalizeString(row.workspacePath),
    workspaceName: normalizeString(row.workspace_name) ?? normalizeString(row.workspaceName),
    snippet: normalizeString(row.snippet),
    matchedRole: normalizeString(row.matched_role) ?? normalizeString(row.matchedRole),
  };
}

export class SidecarConversationStore implements ConversationStore {
  private readonly pageSize: number;
  private readonly maxPages: number;

  constructor(private readonly options: SidecarConversationStoreOptions) {
    this.pageSize = options.pageSize ?? 1000;
    this.maxPages = options.maxPages ?? 250;
  }

  async appendEvent(event: ConversationEvent): Promise<void> {
    await this.appendEvents([event]);
  }

  async appendEvents(events: ConversationEvent[]): Promise<void> {
    for (const event of events) {
      await this.call('store_chat_event', {
        user_id: this.options.userId,
        conversation_id: event.conversationRef,
        event_type: event.type,
        role: roleFromEvent(event),
        content: textFromEvent(event),
        timestamp: event.timestamp,
        revision_id: event.revisionId,
        turn_ref: event.turnRef ?? null,
        event_payload: event,
        record_kind: CHAT_EVENT_RECORD_KIND,
      });
    }
  }

  async rewriteConversation(plan: ConversationRewritePlan): Promise<void> {
    await this.deleteConversation(plan.conversationRef);
    await this.appendEvents(plan.preservedEvents);
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
      const result = await this.call('get_chat_events', {
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
    return buildDisplayConversation(await this.loadEvents(conversationRef));
  }

  async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
    const events = await this.loadEvents(conversationRef);
    const replay = [...events].reverse().map(compactedReplayFromEvent).find(Boolean);
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

  async listMetadata(options: ListConversationOptions = {}): Promise<ConversationMetadata[]> {
    const result = await this.call('list_chat_conversations', {
      user_id: this.options.userId,
      record_kind: CHAT_EVENT_RECORD_KIND,
      limit: options.cursor ? undefined : options.limit,
    });
    const data = normalizeRecord(result.data) ?? {};
    const metadata = (Array.isArray(data.conversations) ? data.conversations : [])
      .map(row => metadataFromRow(normalizeRecord(row) ?? {}))
      .filter((entry): entry is ConversationMetadata => Boolean(entry))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return applyConversationMetadataPagination(metadata, options);
  }

  async searchMetadata(options: SearchConversationOptions): Promise<ConversationMetadata[]> {
    const result = await this.call('search_chat_conversations', {
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
    await this.call('delete_chat_conversation', {
      user_id: this.options.userId,
      conversation_id: conversationRef,
      record_kind: CHAT_EVENT_RECORD_KIND,
    });
  }

  async getRevision(conversationRef: string): Promise<ConversationRevision> {
    const events = await this.loadEvents(conversationRef);
    const last = events[events.length - 1];
    return {
      conversationRef,
      revisionId: last?.revisionId ?? `rev-stored-${conversationRef}`,
      updatedAt: last?.timestamp ?? new Date(0).toISOString(),
    };
  }

  async loadCompactedReplay(conversationRef: string): Promise<CompactedReplaySnapshot | null> {
    const events = await this.loadEvents(conversationRef);
    return [...events].reverse().map(compactedReplayFromEvent).find(Boolean) ?? null;
  }

  private async call(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.options.runtime.rpc) {
      throw new Error('SidecarConversationStore requires a local runtime with rpc support');
    }
    const response = await this.options.runtime.rpc({ method, params });
    if (response.success === false) {
      throw new Error(String(response.error ?? `Sidecar RPC failed: ${method}`));
    }
    return response;
  }
}
