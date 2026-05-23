import {
  buildConversationEventsFromStoredTranscript,
} from './storedTranscriptSdkProjection';
import {
  getConversationWorkspaceBinding,
} from '../workspace/conversationWorkspaceBinding';
import {
  CHAT_EVENT_RECORD_KIND,
} from './localConversationStore';
import {
  createIpcSidecarConversationStore,
} from './sdkSidecarConversationStore';
import { IpcBridge } from '../ipc/bridge';
import {
  buildRehydrateSnapshot,
  createConversationEvent,
  type CompactedReplaySnapshot,
  type ConversationEvent,
  type ConversationMetadata,
  type ConversationRevision,
  type ConversationRewritePlan,
  type ConversationStore,
  type DisplayConversation,
  type JsonRecord,
  type ListConversationOptions,
  type RehydrateSnapshot,
  type SidecarConversationStoreEventWriteContext,
  type SidecarConversationStore,
  resolveToolEventCorrelationId,
} from '../api/windieSdkClient';

export { CHAT_EVENT_RECORD_KIND };

type ElectronSidecarConversationStoreOptions = {
  userId: string;
  pageSize?: number;
  maxPages?: number;
};

type ElectronSidecarConversationStoreDeps = {
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

function eventTypeFromProjectionEntry(entry: TranscriptProjectionRewriteEntry): ConversationEvent['type'] {
  const messageType = typeof entry.messageType === 'string'
    ? entry.messageType.trim().toLowerCase().replaceAll('_', '-')
    : '';
  if (entry.role === 'user' || messageType === 'user') {
    return 'user_message';
  }
  if (messageType === 'tool-bundle-call' || messageType === 'tool-bundle') {
    return 'tool_bundle_call';
  }
  if (messageType === 'tool-bundle-output') {
    return 'tool_bundle_output';
  }
  if (messageType === 'tool-call') {
    return 'tool_call';
  }
  if (entry.role === 'tool' || messageType === 'tool-output') {
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
      modelId: 'modelId' in entry ? entry.modelId ?? null : null,
      modelProvider: 'modelProvider' in entry ? entry.modelProvider ?? null : null,
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

function modelMetadataFromEvent(event: ConversationEvent): {
  modelId: string | null;
  modelProvider: string | null;
} {
  return {
    modelId: normalizeNonEmptyString(event.payload?.modelId)
      ?? normalizeNonEmptyString(event.payload?.model_id),
    modelProvider: normalizeNonEmptyString(event.payload?.modelProvider)
      ?? normalizeNonEmptyString(event.payload?.model_provider),
  };
}

export class ElectronSidecarConversationStore implements ConversationStore {
  private readonly userId: string;
  private readonly deps: Required<ElectronSidecarConversationStoreDeps>;
  private readonly sdkStore: SidecarConversationStore;

  constructor(
    options: ElectronSidecarConversationStoreOptions,
    deps: ElectronSidecarConversationStoreDeps = {},
  ) {
    this.userId = options.userId;
    this.deps = {
      invoke: deps.invoke ?? IpcBridge.invoke,
      getConversationWorkspaceBinding: deps.getConversationWorkspaceBinding ?? getConversationWorkspaceBinding,
    };
    this.sdkStore = createIpcSidecarConversationStore(this.userId, this.deps.invoke, {
      eventWriteParams: context => this.buildDesktopEventWriteParams(context),
    });
  }

  async appendEvent(event: ConversationEvent): Promise<void> {
    await this.sdkStore.appendEvent(event);
  }

  async appendEvents(events: ConversationEvent[]): Promise<void> {
    await this.sdkStore.appendEvents(events);
  }

  async rewriteConversation(plan: ConversationRewritePlan): Promise<void> {
    await this.sdkStore.rewriteConversation(plan);
  }

  async deleteConversation(conversationRef: string): Promise<void> {
    await this.sdkStore.deleteConversation(conversationRef);
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
    await this.deleteConversation(conversationRef);
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
    return this.sdkStore.loadEvents(conversationRef);
  }

  async listMetadata(options: ListConversationOptions = {}): Promise<ConversationMetadata[]> {
    return this.sdkStore.listMetadata(options);
  }

  async getRevision(conversationRef: string): Promise<ConversationRevision> {
    return this.sdkStore.getRevision(conversationRef);
  }

  async loadCompactedReplay(conversationRef: string): Promise<CompactedReplaySnapshot | null> {
    return this.sdkStore.loadCompactedReplay?.(conversationRef) ?? null;
  }

  async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
    return this.sdkStore.loadForDisplay(conversationRef);
  }

  async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
    return this.sdkStore.loadForRehydrate(conversationRef);
  }

  private buildDesktopEventWriteParams({
    event,
  }: SidecarConversationStoreEventWriteContext): JsonRecord {
    const workspaceBinding = this.deps.getConversationWorkspaceBinding(event.conversationRef);
    const attachments = imageAttachmentsFromEvent(event);
    const firstAttachment = attachments[0] ?? null;
    const modelMetadata = modelMetadataFromEvent(event);
    return {
      tool_name: toolNameFromEvent(event),
      correlation_id: correlationIdFromEvent(event),
      workspace_path: workspaceBinding.workspacePath || null,
      workspace_name: workspaceBinding.workspaceName || null,
      metadata: {
        model_id: modelMetadata.modelId,
        model_provider: modelMetadata.modelProvider,
        screenshot: firstAttachment?.['ref']
          ?? firstAttachment?.['url']
          ?? firstAttachment?.['value']
          ?? firstAttachment?.['data']
          ?? null,
      },
      attachments,
      compaction_checkpoint: event.type === 'compaction_applied' ? event.payload : null,
    };
  }

}
