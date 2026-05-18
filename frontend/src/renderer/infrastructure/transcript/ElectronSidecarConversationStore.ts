import {
  buildConversationEventsFromStoredTranscript,
} from './storedTranscriptSdkProjection';
import {
  getConversationWorkspaceBinding,
} from '../workspace/conversationWorkspaceBinding';
import {
  CHAT_EVENT_RECORD_KIND,
  listStoredConversations,
  loadStoredConversationEntries,
} from './localConversationStore';
import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';
import {
  buildConversationMetadata,
  buildDisplayConversation,
  buildRehydrateSnapshot,
  createConversationEvent,
  type CompactedReplaySnapshot,
  type ConversationEvent,
  type ConversationMetadata,
  type ConversationRevision,
  type ConversationRewritePlan,
  type ConversationStore,
  type DisplayConversation,
  type ListConversationOptions,
  type RehydrateSnapshot,
  resolveToolEventCorrelationId,
} from '../api/windieSdkClient';

export { CHAT_EVENT_RECORD_KIND };

type StoredConversationRow = Record<string, unknown>;

type DesktopConversationMetadata = ConversationMetadata & {
  workspacePath?: string | null;
  workspaceName?: string | null;
};

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
  messageId?: string | null;
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
    record_kind: CHAT_EVENT_RECORD_KIND,
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

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
  const storedPayload = parseJsonRecord(row.event_payload)
    ?? parseJsonRecord(row.eventPayload);
  if (storedPayload) {
    return normalizeConversationEvent(storedPayload);
  }
  const structuredPayload = resolveStructuredPayload(row);
  const candidate = structuredPayload.windieSdkConversationEvent
    ?? structuredPayload.windie_sdk_conversation_event
    ?? resolveRowMetadata(row).windieSdkConversationEvent
    ?? resolveRowMetadata(row).windie_sdk_conversation_event;
  return normalizeConversationEvent(candidate);
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
  return resolveToolEventCorrelationId(event.payload);
}

function valueByKeys(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function addImageAttachment(
  attachments: Record<string, unknown>[],
  candidate: unknown,
  sourceField: string,
): void {
  if (candidate === undefined || candidate === null || candidate === '') {
    return;
  }
  const record = normalizeRecord(candidate);
  if (!record) {
    attachments.push({
      kind: 'image',
      sourceField,
      value: candidate,
    });
    return;
  }

  const screenshot = valueByKeys(record, ['screenshot', 'image', 'data', 'base64']);
  const ref = valueByKeys(record, ['screenshotRef', 'screenshot_ref', 'artifactRef', 'artifact_ref', 'ref', 'id']);
  const url = valueByKeys(record, ['screenshotUrl', 'screenshot_url', 'url']);
  const contentType = valueByKeys(record, [
    'screenshotContentType',
    'screenshot_content_type',
    'contentType',
    'content_type',
    'mimeType',
    'mime_type',
  ]);

  attachments.push({
    kind: 'image',
    sourceField,
    ...(ref !== undefined ? { ref } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(contentType !== undefined ? { contentType } : {}),
    ...(screenshot !== undefined ? { data: screenshot } : {}),
    original: record,
  });
}

function collectImageAttachmentsFromRecord(
  attachments: Record<string, unknown>[],
  record: Record<string, unknown>,
): void {
  const directRef = valueByKeys(record, ['screenshotRef', 'screenshot_ref']);
  const directUrl = valueByKeys(record, ['screenshotUrl', 'screenshot_url']);
  const directContentType = valueByKeys(record, ['screenshotContentType', 'screenshot_content_type']);
  const directScreenshot = valueByKeys(record, ['screenshot', 'image']);
  if (
    directRef !== undefined
    || directUrl !== undefined
    || directContentType !== undefined
    || directScreenshot !== undefined
  ) {
    addImageAttachment(attachments, {
      screenshotRef: directRef,
      screenshotUrl: directUrl,
      screenshotContentType: directContentType,
      screenshot: directScreenshot,
    }, 'screenshot');
  }

  for (const key of ['screenshots', 'images', 'attachments', 'artifactRefs', 'artifact_refs']) {
    for (const item of normalizeArray(record[key])) {
      addImageAttachment(attachments, item, key);
    }
  }
  for (const key of ['screenshotRefs', 'screenshot_refs']) {
    for (const item of normalizeArray(record[key])) {
      addImageAttachment(attachments, { screenshotRef: item }, key);
    }
  }
}

function imageAttachmentsFromEvent(event: ConversationEvent): Record<string, unknown>[] {
  const attachments: Record<string, unknown>[] = [];
  const payload = normalizeRecord(event.payload) ?? {};
  const roots = [
    payload,
    normalizeRecord(payload.result),
    normalizeRecord(payload.data),
    normalizeRecord(payload.output),
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));

  for (const root of roots) {
    collectImageAttachmentsFromRecord(attachments, root);
  }

  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = JSON.stringify(attachment);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

function eventTypeFromProjectionEntry(entry: TranscriptProjectionRewriteEntry): ConversationEvent['type'] {
  if (entry.role === 'user' || entry.messageType === 'user') {
    return 'user_message';
  }
  if (entry.messageType === 'tool_bundle_call') {
    return 'tool_bundle_call';
  }
  if (entry.messageType === 'tool_bundle_output') {
    return 'tool_bundle_output';
  }
  if (entry.messageType === 'tool_call') {
    return 'tool_call';
  }
  if (entry.role === 'tool' || entry.messageType === 'tool_output') {
    return 'tool_output';
  }
  return 'assistant_message';
}

function projectionEntryToConversationEvent(
  conversationRef: string,
  revisionId: string,
  entry: TranscriptProjectionRewriteEntry | TranscriptProjectionAppendEntry,
  index: number,
): ConversationEvent {
  const structuredPayload = 'rehydrateEntry' in entry && entry.rehydrateEntry
    ? entry.rehydrateEntry
    : {};
  return createConversationEvent({
    eventId: `projection-${conversationRef}-${revisionId}-${index}`,
    type: eventTypeFromProjectionEntry(entry),
    conversationRef,
    revisionId,
    timestamp: entry.timestamp || undefined,
    source: 'sdk',
    payload: {
      id: entry.messageId || undefined,
      messageId: entry.messageId || undefined,
      text: entry.content,
      content: entry.content,
      role: entry.role,
      messageType: entry.messageType,
      correlationId: entry.correlationId || null,
      requestId: entry.correlationId || null,
      toolName: entry.toolName || null,
      toolCallId: entry.correlationId || null,
      screenshotRef: entry.screenshot ?? null,
      screenshot: entry.screenshot ?? null,
      structuredPayload,
    },
  });
}

function compactedReplayFromEvent(event: ConversationEvent): CompactedReplaySnapshot | null {
  if (event.type !== 'compaction_applied') {
    return null;
  }
  const entries = Array.isArray(event.payload.entries)
    ? event.payload.entries.filter((entry): entry is Record<string, unknown> => (
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    ))
    : [];
  const entryCount = typeof event.payload.entryCount === 'number'
    ? event.payload.entryCount
    : (typeof event.payload.entry_count === 'number' ? event.payload.entry_count : entries.length);
  const complete = event.payload.complete !== false;
  if (!complete || entryCount !== entries.length || entries.length === 0) {
    return null;
  }
  return {
    generationId: normalizeNonEmptyString(event.payload.generationId)
      ?? normalizeNonEmptyString(event.payload.generation_id)
      ?? `compaction-${event.eventId}`,
    conversationRef: event.conversationRef,
    sourceRevisionId: normalizeNonEmptyString(event.payload.sourceRevisionId)
      ?? normalizeNonEmptyString(event.payload.source_revision_id)
      ?? event.revisionId,
    sourceTurnRef: normalizeNonEmptyString(event.payload.sourceTurnRef)
      ?? normalizeNonEmptyString(event.payload.source_turn_ref)
      ?? event.turnRef
      ?? null,
    createdAt: normalizeNonEmptyString(event.payload.createdAt)
      ?? normalizeNonEmptyString(event.payload.created_at)
      ?? event.timestamp,
    entries,
    entryCount,
    complete,
    active: event.payload.active !== false,
  };
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
    await this.deleteRecordKind(plan.conversationRef);
    await this.appendEvents(plan.preservedEvents);
  }

  async deleteConversation(conversationRef: string): Promise<void> {
    await this.deleteRecordKind(conversationRef);
  }

  async appendTranscriptProjectionEntry(entry: TranscriptProjectionAppendEntry): Promise<void> {
    const revision = await this.getRevision(entry.conversationRef);
    await this.appendEvent(projectionEntryToConversationEvent(
      entry.conversationRef,
      revision.revisionId,
      entry,
      Date.now(),
    ));
  }

  async rewriteTranscriptProjection({
    conversationRef,
    entries,
    rehydrateEntries,
  }: {
    conversationRef: string;
    entries: TranscriptProjectionRewriteEntry[];
    rehydrateEntries?: TranscriptProjectionRewriteEntry[];
  }): Promise<RehydrateSnapshot> {
    await this.deleteRecordKind(conversationRef);
    const revisionId = `rev-rewrite-${conversationRef}-${Date.now()}`;
    await this.appendEvents(entries.map((entry, index) => (
      projectionEntryToConversationEvent(conversationRef, revisionId, entry, index)
    )));

    return buildRehydrateSnapshotFromTranscriptProjectionEntries({
      conversationRef,
      entries: rehydrateEntries ?? entries,
    });
  }

  async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
    if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
      return;
    }
    await this.appendEvent(createConversationEvent({
      eventId: `compaction-${snapshot.generationId}`,
      type: 'compaction_applied',
      conversationRef: snapshot.conversationRef,
      revisionId: snapshot.sourceRevisionId,
      turnRef: snapshot.sourceTurnRef ?? null,
      timestamp: snapshot.createdAt,
      source: 'sdk',
      payload: {
        generationId: snapshot.generationId,
        sourceRevisionId: snapshot.sourceRevisionId,
        sourceTurnRef: snapshot.sourceTurnRef ?? null,
        createdAt: snapshot.createdAt,
        entries: snapshot.entries,
        entryCount: snapshot.entryCount,
        complete: snapshot.complete,
        active: true,
        summaryPreview: typeof snapshot.entries[0]?.content === 'string'
          ? snapshot.entries[0].content
          : null,
      },
    }));
  }

  async loadEvents(conversationRef: string): Promise<ConversationEvent[]> {
    const storedEventRows = await this.loadRows(conversationRef, CHAT_EVENT_RECORD_KIND);
    return storedEventRows
      .map(resolveStoredSdkEvent)
      .filter((event): event is ConversationEvent => Boolean(event));
  }

  async listMetadata(options: ListConversationOptions = {}): Promise<ConversationMetadata[]> {
    const limit = normalizePositiveInteger(options.limit);
    const fetchLimit = options.cursor ? null : limit;
    const eventMetadata = await this.listMetadataForRecordKind(CHAT_EVENT_RECORD_KIND, fetchLimit);
    const sorted = eventMetadata
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
    const events = await this.loadEvents(conversationRef);
    for (const event of [...events].reverse()) {
      const replay = compactedReplayFromEvent(event);
      if (replay) {
        return replay;
      }
    }
    return null;
  }

  async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
    return buildDisplayConversation(await this.loadEvents(conversationRef));
  }

  async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
    const events = await this.loadEvents(conversationRef);
    let replay: CompactedReplaySnapshot | null = null;
    for (const event of [...events].reverse()) {
      replay = compactedReplayFromEvent(event);
      if (replay) {
        break;
      }
    }
    if (replay?.complete && replay.entryCount === replay.entries.length) {
      return {
        conversationRef,
        revisionId: replay.sourceRevisionId,
        messages: replay.entries,
        replayGenerationId: replay.generationId,
      };
    }
    return buildRehydrateSnapshot(events);
  }

  private async storeEvent(event: ConversationEvent): Promise<void> {
    const workspaceBinding = this.deps.getConversationWorkspaceBinding(event.conversationRef);
    const attachments = imageAttachmentsFromEvent(event);
    const firstAttachment = attachments[0] ?? null;
    const result = await this.deps.invoke(INVOKE_CHANNELS.STORE_CHAT_EVENT, {
      content: textFromEvent(event),
      userId: this.userId,
      conversationId: event.conversationRef,
      eventType: event.type,
      role: roleFromEvent(event),
      toolName: toolNameFromEvent(event),
      correlationId: correlationIdFromEvent(event),
      timestamp: event.timestamp,
      revisionId: event.revisionId,
      turnRef: event.turnRef ?? null,
      workspacePath: workspaceBinding.workspacePath || null,
      workspaceName: workspaceBinding.workspaceName || null,
      metadata: {
        screenshot: firstAttachment?.['ref']
          ?? firstAttachment?.['url']
          ?? firstAttachment?.['value']
          ?? firstAttachment?.['data']
          ?? null,
      },
      attachments,
      eventPayload: event,
      compactionCheckpoint: event.type === 'compaction_applied' ? event.payload : null,
    });
    if (!result || result.success === false) {
      throw new Error(result?.error || 'Failed to store SDK conversation event');
    }
  }

  private async deleteRecordKind(conversationRef: string): Promise<void> {
    const result = await this.deps.invoke(INVOKE_CHANNELS.DELETE_CHAT_CONVERSATION, {
      userId: this.userId,
      conversationId: conversationRef,
    });
    if (!result || result.success === false) {
      throw new Error(result?.error || 'Failed to delete chat event conversation rows');
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
  ): Promise<DesktopConversationMetadata[]> {
    const rows = await this.deps.listStoredConversations({
      userId: this.userId,
      limit,
      recordKind,
    });
    return rows
      .map((row): DesktopConversationMetadata | null => {
        const conversationRef = conversationRefFromMetadata(row);
        if (!conversationRef) {
          return null;
        }
        const workspacePath = normalizeNonEmptyString(row.workspace_path)
          ?? normalizeNonEmptyString(row.workspacePath)
          ?? null;
        const workspaceName = normalizeNonEmptyString(row.workspace_name)
          ?? normalizeNonEmptyString(row.workspaceName)
          ?? null;
        return {
          conversationRef,
          revisionId: normalizeNonEmptyString(row.revision_id)
            ?? normalizeNonEmptyString(row.revisionId)
            ?? `rev-stored-${conversationRef}`,
          title: normalizeNonEmptyString(row.title) ?? conversationRef,
          lastMessage: normalizeNonEmptyString(row.last_message)
            ?? normalizeNonEmptyString(row.lastMessage)
            ?? null,
          updatedAt: updatedAtFromMetadata(row),
          eventCount: typeof row.entry_count === 'number'
            ? row.entry_count
            : Number(row.entryCount ?? 0) || 0,
          workspacePath,
          workspaceName,
        } satisfies DesktopConversationMetadata;
      })
      .filter((metadata): metadata is DesktopConversationMetadata => Boolean(metadata));
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
