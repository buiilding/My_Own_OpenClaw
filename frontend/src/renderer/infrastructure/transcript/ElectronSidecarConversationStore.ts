import {
  buildConversationEventsFromStoredTranscript,
} from './storedTranscriptSdkProjection';
import {
  appendConversationReplayEntry,
  buildReplayRowStoragePayload,
  deleteConversationStoredState,
  ensureConversationReplayStateInitialized,
  readStoredReplayRehydrateEntry,
  replaceConversationReplayState,
  TRANSCRIPT_REPLAY_RECORD_KIND,
} from './conversationReplayState';
import {
  getConversationWorkspaceBinding,
} from '../workspace/conversationWorkspaceBinding';
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
  getConversationWorkspaceBinding?: typeof getConversationWorkspaceBinding;
};

export type TranscriptProjectionRewriteEntry = {
  content: string;
  role: string;
  messageType: string;
  toolName?: string | null;
  correlationId?: string | null;
  screenshot?: unknown;
  timestamp?: string | null;
};

export type TranscriptProjectionAppendEntry = TranscriptProjectionRewriteEntry & {
  conversationRef: string;
  modelId?: string | null;
  modelProvider?: string | null;
  transparency?: Record<string, unknown> | null;
  structuredPayload?: Record<string, unknown> | null;
  rehydrateEntry: Record<string, unknown>;
};

export function buildRehydrateSnapshotFromTranscriptProjectionEntries({
  conversationRef,
  entries,
}: {
  conversationRef: string;
  entries: TranscriptProjectionRewriteEntry[];
}): RehydrateSnapshot {
  const transcriptRows = entries.map((entry, index) => ({
    id: `projection-${conversationRef}-${index}`,
    content: entry.content,
    role: entry.role,
    message_type: entry.messageType,
    tool_name: entry.toolName || null,
    correlation_id: entry.correlationId || null,
    screenshot: entry.screenshot ?? null,
    timestamp: entry.timestamp || null,
    record_kind: 'transcript',
    message_index: index + 1,
  }));
  return buildRehydrateSnapshot(
    buildConversationEventsFromStoredTranscript(transcriptRows, { conversationRef }),
  );
}

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

function applyMetadataPagination<T extends { conversationRef: string }>(
  metadata: T[],
  options: ListConversationOptions,
): T[] {
  const cursorIndex = typeof options.cursor === 'string'
    ? metadata.findIndex((entry) => entry.conversationRef === options.cursor)
    : -1;
  const afterCursor = cursorIndex >= 0 ? metadata.slice(cursorIndex + 1) : metadata;
  return typeof options.limit === 'number' ? afterCursor.slice(0, options.limit) : afterCursor;
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
      getConversationWorkspaceBinding: deps.getConversationWorkspaceBinding ?? getConversationWorkspaceBinding,
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

  async deleteConversation(conversationRef: string): Promise<void> {
    await deleteConversationStoredState({
      userId: this.userId,
      conversationRef,
    }, this.getReplayStoreDeps());
    await this.deleteRecordKind(conversationRef, SDK_CONVERSATION_EVENT_RECORD_KIND);
  }

  async appendTranscriptProjectionEntry(entry: TranscriptProjectionAppendEntry): Promise<void> {
    const workspaceBinding = this.deps.getConversationWorkspaceBinding(entry.conversationRef);
    const result = await this.deps.invoke(INVOKE_CHANNELS.STORE_TRANSCRIPT, {
      content: entry.content,
      userId: this.userId,
      conversationRef: entry.conversationRef,
      role: entry.role,
      messageType: entry.messageType,
      toolName: entry.toolName,
      correlationId: entry.correlationId,
      modelId: entry.modelId,
      modelProvider: entry.modelProvider,
      screenshot: entry.screenshot,
      timestamp: entry.timestamp,
      workspacePath: workspaceBinding.workspacePath || null,
      workspaceName: workspaceBinding.workspaceName || null,
      ...(entry.transparency ? { transparency: entry.transparency } : {}),
      ...(entry.structuredPayload ? { structuredPayload: entry.structuredPayload } : {}),
    });
    if (result?.success === false) {
      throw new Error(result.error || 'Failed to store transcript entry');
    }

    const messageIndex = typeof result?.data?.message_index === 'number'
      ? result.data.message_index
      : null;
    const replayContext = {
      conversationRef: entry.conversationRef,
      userId: this.userId,
      workspacePath: workspaceBinding.workspacePath || null,
      workspaceName: workspaceBinding.workspaceName || null,
    };
    const replayStoreDeps = this.getReplayStoreDeps();
    const replayInitState = await ensureConversationReplayStateInitialized(
      replayContext,
      replayStoreDeps,
    );
    if (replayInitState !== 'bootstrapped') {
      await appendConversationReplayEntry(
        replayContext,
        {
          messageIndex,
          rehydrateEntry: entry.rehydrateEntry,
        },
        replayStoreDeps,
      );
    }
  }

  async rewriteTranscriptProjection({
    conversationRef,
    entries,
  }: {
    conversationRef: string;
    entries: TranscriptProjectionRewriteEntry[];
  }): Promise<void> {
    const workspaceBinding = this.deps.getConversationWorkspaceBinding(conversationRef);
    await deleteConversationStoredState({
      userId: this.userId,
      conversationRef,
      workspacePath: workspaceBinding.workspacePath || null,
      workspaceName: workspaceBinding.workspaceName || null,
    }, this.getReplayStoreDeps());

    for (const entry of entries) {
      const result = await this.deps.invoke(INVOKE_CHANNELS.STORE_TRANSCRIPT, {
        content: entry.content,
        userId: this.userId,
        conversationRef,
        role: entry.role,
        messageType: entry.messageType,
        toolName: entry.toolName || null,
        correlationId: entry.correlationId || null,
        screenshot: entry.screenshot ?? null,
        timestamp: entry.timestamp || null,
        workspacePath: workspaceBinding.workspacePath || null,
        workspaceName: workspaceBinding.workspaceName || null,
      });
      if (!result || result.success === false) {
        throw new Error(result?.error || 'Failed to store rewritten transcript entry');
      }
    }
  }

  async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
    if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
      return;
    }
    const workspaceBinding = this.deps.getConversationWorkspaceBinding(snapshot.conversationRef);
    await replaceConversationReplayState(
      {
        userId: this.userId,
        conversationRef: snapshot.conversationRef,
        workspacePath: workspaceBinding.workspacePath || null,
        workspaceName: workspaceBinding.workspaceName || null,
      },
      snapshot.entries.map((entry, index) => ({
        messageIndex: index + 1,
        rehydrateEntry: entry,
      })),
      this.getReplayStoreDeps(),
      {
        generationId: snapshot.generationId,
        sourceRevisionId: snapshot.sourceRevisionId,
        sourceTurnRef: snapshot.sourceTurnRef,
        entryCount: snapshot.entryCount,
        complete: snapshot.complete,
      },
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
    const fetchLimit = options.cursor ? null : limit;
    const [transcriptMetadata, eventMetadata] = await Promise.all([
      this.listMetadataForRecordKind('transcript', fetchLimit),
      this.listMetadataForRecordKind(SDK_CONVERSATION_EVENT_RECORD_KIND, fetchLimit),
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
    return applyMetadataPagination(sorted, {
      ...options,
      limit: limit ?? undefined,
    });
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
    const generation = selectActiveReplayGeneration(entries);
    if (!generation) {
      return null;
    }
    const first = generation.entries[0] ?? {};
    return {
      generationId: normalizeNonEmptyString(first.replay_generation_id)
        ?? `stored-replay-${conversationRef}`,
      conversationRef,
      sourceRevisionId: normalizeNonEmptyString(first.replay_source_revision_id)
        ?? `rev-stored-${conversationRef}`,
      sourceTurnRef: normalizeNonEmptyString(first.replay_source_turn_ref),
      createdAt: normalizeNonEmptyString(replayRows[0]?.timestamp) ?? new Date(0).toISOString(),
      entries: generation.entries,
      entryCount: generation.entries.length,
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

  private async storeReplayRow(
    context: {
      conversationRef: string;
      userId: string;
      workspacePath?: string | null;
      workspaceName?: string | null;
    },
    entry: {
      messageIndex?: number | null;
      rehydrateEntry: Record<string, unknown>;
    },
  ): Promise<void> {
    const result = await this.deps.invoke(
      INVOKE_CHANNELS.STORE_TRANSCRIPT,
      buildReplayRowStoragePayload(context, entry),
    );
    if (!result || result.success === false) {
      throw new Error(result?.error || 'Failed to store replay transcript row');
    }
  }

  private getReplayStoreDeps() {
    return {
      deleteConversationRecordKind: async (
        context: { conversationRef: string },
        recordKind: string,
      ) => this.deleteRecordKind(context.conversationRef, recordKind),
      storeReplayRow: async (
        context: {
          conversationRef: string;
          userId: string;
          workspacePath?: string | null;
          workspaceName?: string | null;
        },
        entry: {
          messageIndex?: number | null;
          rehydrateEntry: Record<string, unknown>;
        },
      ) => this.storeReplayRow(context, entry),
    };
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

function replayGenerationId(entry: Record<string, unknown>, fallback: string): string {
  return normalizeNonEmptyString(entry.replay_generation_id) ?? fallback;
}

function replayEntryIndex(entry: Record<string, unknown>, fallback: number): number {
  const value = entry.replay_generation_entry_index;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function replayEntryCount(entry: Record<string, unknown>): number | null {
  const value = entry.replay_generation_entry_count;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function replayGenerationComplete(entry: Record<string, unknown>): boolean {
  return entry.replay_generation_complete !== false;
}

function selectActiveReplayGeneration(
  entries: Record<string, unknown>[],
): { generationId: string; entries: Record<string, unknown>[] } | null {
  const generations = new Map<string, Record<string, unknown>[]>();
  entries.forEach((entry) => {
    const generationId = replayGenerationId(entry, 'legacy');
    const generationEntries = generations.get(generationId) ?? [];
    generationEntries.push(entry);
    generations.set(generationId, generationEntries);
  });

  const candidates: Array<{ generationId: string; entries: Record<string, unknown>[]; maxIndex: number }> = [];
  for (const [generationId, generationEntries] of generations) {
    const sortedEntries = [...generationEntries]
      .sort((a, b) => replayEntryIndex(a, 0) - replayEntryIndex(b, 0));
    const first = sortedEntries[0] ?? {};
    const expectedCount = replayEntryCount(first) ?? sortedEntries.length;
    if (!replayGenerationComplete(first) || expectedCount !== sortedEntries.length) {
      continue;
    }
    candidates.push({
      generationId,
      entries: sortedEntries,
      maxIndex: entries.lastIndexOf(generationEntries[generationEntries.length - 1]),
    });
  }

  candidates.sort((a, b) => b.maxIndex - a.maxIndex);
  return candidates[0] ?? null;
}

export function buildElectronSidecarConversationMetadata(
  events: ConversationEvent[],
): ConversationMetadata {
  return buildConversationMetadata(events);
}
