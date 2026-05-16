import {
  buildConversationEventsFromStoredTranscript,
} from './storedTranscriptSdkProjection';
import {
  readStoredReplayRehydrateEntry,
  replaceConversationReplayState,
  TRANSCRIPT_REPLAY_RECORD_KIND,
} from './conversationReplayState';
import {
  listStoredConversations,
  loadStoredConversationEntries,
} from './localConversationStore';
import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import {
  buildConversationMetadata,
  buildDisplayConversation,
  buildRehydrateSnapshot,
  type CompactedReplaySnapshot,
  type ConversationEvent,
  type ConversationMetadata,
  type ConversationRevision,
  type ConversationRewritePlan,
  type ConversationStore,
  type DisplayConversation,
  type ListConversationOptions,
  type RehydrateSnapshot,
} from '../api/windieSdkClient';

export const SDK_CONVERSATION_EVENT_RECORD_KIND = 'conversation_event';

type StoredConversationRow = Record<string, unknown>;

type ElectronSidecarConversationStoreOptions = {
  userId: string;
  pageSize?: number;
  maxPages?: number;
};

type ElectronSidecarConversationStoreDeps = {
  loadStoredConversationEntries?: typeof loadStoredConversationEntries;
  listStoredConversations?: typeof listStoredConversations;
  invoke?: typeof IpcBridge.invoke;
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
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

function resolveRowMetadata(row: StoredConversationRow): Record<string, unknown> {
  return parseJsonRecord(row.metadata) ?? {};
}

function resolveStructuredPayload(row: StoredConversationRow): Record<string, unknown> {
  const metadata = resolveRowMetadata(row);
  return parseJsonRecord(metadata.structured_payload)
    ?? parseJsonRecord(metadata.structuredPayload)
    ?? parseJsonRecord(row.structured_payload)
    ?? parseJsonRecord(row.structuredPayload)
    ?? {};
}

function resolveStoredSdkEvent(row: StoredConversationRow): ConversationEvent | null {
  const structuredPayload = resolveStructuredPayload(row);
  const candidate = structuredPayload.windieSdkConversationEvent
    ?? structuredPayload.windie_sdk_conversation_event
    ?? resolveRowMetadata(row).windieSdkConversationEvent
    ?? resolveRowMetadata(row).windie_sdk_conversation_event;
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

function textFromEvent(event: ConversationEvent): string {
  const payload = normalizeRecord(event.payload) ?? {};
  for (const key of ['text', 'content', 'finalResponse', 'final_response', 'error']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return `[sdk event: ${event.type}]`;
}

function toolNameFromEvent(event: ConversationEvent): string | null {
  const payload = normalizeRecord(event.payload) ?? {};
  return normalizeNonEmptyString(payload.toolName)
    ?? normalizeNonEmptyString(payload.tool_name);
}

function correlationIdFromEvent(event: ConversationEvent): string | null {
  const payload = normalizeRecord(event.payload) ?? {};
  return normalizeNonEmptyString(payload.requestId)
    ?? normalizeNonEmptyString(payload.request_id)
    ?? normalizeNonEmptyString(payload.bundleId)
    ?? normalizeNonEmptyString(payload.bundle_id)
    ?? normalizeNonEmptyString(payload.toolCallId)
    ?? normalizeNonEmptyString(payload.tool_call_id)
    ?? normalizeNonEmptyString(payload.correlationId)
    ?? normalizeNonEmptyString(payload.correlation_id);
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

function sortEvents(events: ConversationEvent[]): ConversationEvent[] {
  return [...events].sort((a, b) => {
    const timeDiff = Date.parse(a.timestamp) - Date.parse(b.timestamp);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.eventId.localeCompare(b.eventId);
  });
}

function conversationRefFromMetadata(row: StoredConversationRow): string | null {
  return normalizeNonEmptyString(row.conversation_id)
    ?? normalizeNonEmptyString(row.conversationId)
    ?? normalizeNonEmptyString(row.conversation_ref)
    ?? normalizeNonEmptyString(row.conversationRef);
}

function updatedAtFromMetadata(row: StoredConversationRow): string {
  return normalizeNonEmptyString(row.last_timestamp)
    ?? normalizeNonEmptyString(row.updatedAt)
    ?? normalizeNonEmptyString(row.timestamp)
    ?? new Date(0).toISOString();
}

export class ElectronSidecarConversationStore implements ConversationStore {
  private readonly userId: string;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly deps: Required<ElectronSidecarConversationStoreDeps>;

  constructor(
    options: ElectronSidecarConversationStoreOptions,
    deps: ElectronSidecarConversationStoreDeps = {},
  ) {
    this.userId = options.userId;
    this.pageSize = options.pageSize ?? 1000;
    this.maxPages = options.maxPages ?? 250;
    this.deps = {
      loadStoredConversationEntries: deps.loadStoredConversationEntries ?? loadStoredConversationEntries,
      listStoredConversations: deps.listStoredConversations ?? listStoredConversations,
      invoke: deps.invoke ?? IpcBridge.invoke,
    };
  }

  async appendEvent(event: ConversationEvent): Promise<void> {
    await this.appendEvents([event]);
  }

  async appendEvents(events: ConversationEvent[]): Promise<void> {
    for (const event of events) {
      await this.storeEvent(event);
    }
  }

  async rewriteConversation(plan: ConversationRewritePlan): Promise<void> {
    await this.deleteRecordKind(plan.conversationRef, SDK_CONVERSATION_EVENT_RECORD_KIND);
    await this.appendEvents(plan.preservedEvents);
  }

  async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
    if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
      return;
    }
    await replaceConversationReplayState(
      {
        userId: this.userId,
        conversationRef: snapshot.conversationRef,
      },
      snapshot.entries.map((entry, index) => ({
        messageIndex: index + 1,
        rehydrateEntry: {
          ...entry,
          replay_generation_id: snapshot.generationId,
          replay_source_revision_id: snapshot.sourceRevisionId,
          replay_source_turn_ref: snapshot.sourceTurnRef ?? null,
        },
      })),
    );
  }

  async loadEvents(conversationRef: string): Promise<ConversationEvent[]> {
    const storedEventRows = await this.loadRows(conversationRef, SDK_CONVERSATION_EVENT_RECORD_KIND);
    const storedEvents = storedEventRows
      .map(resolveStoredSdkEvent)
      .filter((event): event is ConversationEvent => Boolean(event));
    if (storedEvents.length > 0) {
      return sortEvents(storedEvents);
    }

    const transcriptRows = await this.loadRows(conversationRef, 'transcript');
    return buildConversationEventsFromStoredTranscript(transcriptRows, { conversationRef });
  }

  async listMetadata(options: ListConversationOptions = {}): Promise<ConversationMetadata[]> {
    const limit = normalizePositiveInteger(options.limit);
    const [transcriptMetadata, eventMetadata] = await Promise.all([
      this.listMetadataForRecordKind('transcript', limit),
      this.listMetadataForRecordKind(SDK_CONVERSATION_EVENT_RECORD_KIND, limit),
    ]);
    const merged = new Map<string, ConversationMetadata>();
    for (const metadata of transcriptMetadata) {
      merged.set(metadata.conversationRef, metadata);
    }
    for (const metadata of eventMetadata) {
      merged.set(metadata.conversationRef, metadata);
    }
    const sorted = Array.from(merged.values())
      .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }

  async getRevision(conversationRef: string): Promise<ConversationRevision> {
    const events = await this.loadEvents(conversationRef);
    const lastEvent = events[events.length - 1];
    return {
      conversationRef,
      revisionId: lastEvent?.revisionId ?? `rev-stored-${conversationRef}`,
      updatedAt: lastEvent?.timestamp ?? new Date(0).toISOString(),
    };
  }

  async loadCompactedReplay(conversationRef: string): Promise<CompactedReplaySnapshot | null> {
    const replayRows = await this.loadRows(conversationRef, TRANSCRIPT_REPLAY_RECORD_KIND);
    const entries = replayRows
      .map(readStoredReplayRehydrateEntry)
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
    if (entries.length === 0) {
      return null;
    }
    const first = entries[0] ?? {};
    return {
      generationId: normalizeNonEmptyString(first.replay_generation_id)
        ?? `stored-replay-${conversationRef}`,
      conversationRef,
      sourceRevisionId: normalizeNonEmptyString(first.replay_source_revision_id)
        ?? `rev-stored-${conversationRef}`,
      sourceTurnRef: normalizeNonEmptyString(first.replay_source_turn_ref),
      createdAt: normalizeNonEmptyString(replayRows[0]?.timestamp) ?? new Date(0).toISOString(),
      entries,
      entryCount: entries.length,
      complete: true,
      active: true,
    };
  }

  async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
    return buildDisplayConversation(await this.loadEvents(conversationRef));
  }

  async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
    const replay = await this.loadCompactedReplay(conversationRef);
    if (replay?.complete && replay.entryCount === replay.entries.length) {
      return {
        conversationRef,
        revisionId: replay.sourceRevisionId,
        messages: replay.entries,
        replayGenerationId: replay.generationId,
      };
    }
    return buildRehydrateSnapshot(await this.loadEvents(conversationRef));
  }

  private async storeEvent(event: ConversationEvent): Promise<void> {
    const result = await this.deps.invoke(INVOKE_CHANNELS.STORE_TRANSCRIPT, {
      content: textFromEvent(event),
      userId: this.userId,
      conversationRef: event.conversationRef,
      role: roleFromEvent(event),
      messageType: event.type,
      toolName: toolNameFromEvent(event),
      correlationId: correlationIdFromEvent(event),
      timestamp: event.timestamp,
      recordKind: SDK_CONVERSATION_EVENT_RECORD_KIND,
      structuredPayload: {
        windieSdkConversationEvent: event,
      },
    });
    if (!result || result.success === false) {
      throw new Error(result?.error || 'Failed to store SDK conversation event');
    }
  }

  private async deleteRecordKind(conversationRef: string, recordKind: string): Promise<void> {
    const result = await this.deps.invoke(INVOKE_CHANNELS.DELETE_CONVERSATION, {
      userId: this.userId,
      conversationId: conversationRef,
      recordKind,
    });
    if (!result || result.success === false) {
      throw new Error(result?.error || `Failed to delete ${recordKind} conversation rows`);
    }
  }

  private async loadRows(conversationRef: string, recordKind: string): Promise<StoredConversationRow[]> {
    return this.deps.loadStoredConversationEntries({
      userId: this.userId,
      conversationRef,
      recordKind,
      pageSize: this.pageSize,
      maxPages: this.maxPages,
    });
  }

  private async listMetadataForRecordKind(
    recordKind: string,
    limit: number | null,
  ): Promise<ConversationMetadata[]> {
    const rows = await this.deps.listStoredConversations({
      userId: this.userId,
      limit,
      recordKind,
    });
    return rows
      .map((row): ConversationMetadata | null => {
        const conversationRef = conversationRefFromMetadata(row);
        if (!conversationRef) {
          return null;
        }
        return {
          conversationRef,
          revisionId: `rev-stored-${conversationRef}`,
          title: normalizeNonEmptyString(row.title) ?? conversationRef,
          lastMessage: normalizeNonEmptyString(row.last_message)
            ?? normalizeNonEmptyString(row.lastMessage)
            ?? null,
          updatedAt: updatedAtFromMetadata(row),
          eventCount: typeof row.entry_count === 'number'
            ? row.entry_count
            : Number(row.entryCount ?? 0) || 0,
        } satisfies ConversationMetadata;
      })
      .filter((metadata): metadata is ConversationMetadata => Boolean(metadata));
  }
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function buildElectronSidecarConversationMetadata(
  events: ConversationEvent[],
): ConversationMetadata {
  return buildConversationMetadata(events);
}
