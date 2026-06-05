import {
  buildConversationEventsFromStoredTranscript,
} from './storedTranscriptSdkProjection';
import {
  getConversationWorkspaceBinding,
} from '../workspace/conversationWorkspaceBinding';
import {
  buildRehydrateSnapshot,
  createConversationEvent,
  type CompactedReplaySnapshot,
  type ConversationMetadata,
  type ConversationRewritePlan,
  type ConversationEvent,
  type JsonRecord,
  type ListConversationOptions,
  type RehydrateSnapshot,
  type SearchConversationOptions,
  type ConversationStore,
  type DisplayConversation,
  type SdkDisplayRow,
  resolveToolEventCorrelationId,
} from '../api/windieSdkClient';
import { invokeWindieCommand } from '../../app/runtime/windieCommandInvokeClient';

export const CHAT_EVENT_RECORD_KIND = 'chat_event';

type DesktopConversationStoreDeps = {
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
  screenshotRef?: string | null;
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
    ? entry.messageType.trim().toLowerCase().replace(/_/g, '-')
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
  deps: Required<DesktopConversationStoreDeps> = resolveDesktopConversationStoreDeps(),
): ConversationEvent {
  const structuredPayload = 'rehydrateEntry' in entry && entry.rehydrateEntry
    ? entry.rehydrateEntry
    : {};
  const event = createConversationEvent({
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
      screenshotRef: entry.screenshotRef ?? null,
      screenshot: entry.screenshot ?? null,
      structuredPayload,
    },
  });
  const writeParams = buildDesktopEventWriteParams(event, deps);
  return {
    ...event,
    payload: {
      ...event.payload,
      toolName: writeParams.tool_name ?? event.payload.toolName ?? null,
      correlationId: writeParams.correlation_id ?? event.payload.correlationId ?? null,
      workspacePath: writeParams.workspace_path ?? null,
      workspaceName: writeParams.workspace_name ?? null,
      metadata: writeParams.metadata ?? {},
      attachments: Array.isArray(writeParams.attachments) ? writeParams.attachments : [],
      compactionCheckpoint: writeParams.compaction_checkpoint ?? null,
    },
  };
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

function resolveDesktopConversationStoreDeps(
  deps: DesktopConversationStoreDeps = {},
): Required<DesktopConversationStoreDeps> {
  return {
    getConversationWorkspaceBinding: deps.getConversationWorkspaceBinding ?? getConversationWorkspaceBinding,
  };
}

function buildDesktopEventWriteParams(
  event: ConversationEvent,
  deps: Required<DesktopConversationStoreDeps>,
): JsonRecord {
  const workspaceBinding = deps.getConversationWorkspaceBinding(event.conversationRef);
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

export function createDesktopConversationStore(
  userId: string,
  deps: DesktopConversationStoreDeps = {},
): ConversationStore {
  const resolvedDeps = resolveDesktopConversationStoreDeps(deps);
  return {
    async appendEvent(event: ConversationEvent): Promise<void> {
      await invokeWindieCommand('conversation.appendEvent', {
        userId,
        conversationRef: event.conversationRef,
        event,
      });
    },
    async appendEvents(events: ConversationEvent[]): Promise<void> {
      for (const event of events) {
        await this.appendEvent(event);
      }
    },
    async rewriteConversation(plan: ConversationRewritePlan): Promise<void> {
      await invokeWindieCommand('conversation.rewrite', {
        userId,
        conversationRef: plan.conversationRef,
        plan,
      });
    },
    async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
      await invokeWindieCommand('conversation.replaceCompactedReplay', {
        userId,
        conversationRef: snapshot.conversationRef,
        snapshot,
      });
    },
    async loadEvents(conversationRef: string): Promise<ConversationEvent[]> {
      const snapshot = await invokeWindieCommand<{
        state?: { events?: ConversationEvent[] };
      }>('conversation.load', {
        userId,
        conversationRef,
      });
      return Array.isArray(snapshot?.state?.events) ? snapshot.state.events : [];
    },
    async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
      const snapshot = await invokeWindieCommand<{
        display?: DisplayConversation;
      }>('conversation.load', {
        userId,
        conversationRef,
      });
      return snapshot?.display ?? {
        conversationRef,
        revisionId: '',
        messages: [],
        compaction: { status: 'idle' },
      };
    },
    async loadDisplayRows(conversationRef: string): Promise<SdkDisplayRow[]> {
      const snapshot = await invokeWindieCommand<{
        displayRows?: SdkDisplayRow[];
      }>('conversation.load', {
        userId,
        conversationRef,
      });
      return Array.isArray(snapshot?.displayRows) ? snapshot.displayRows : [];
    },
    async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
      const snapshot = await invokeWindieCommand<{
        rehydrate?: RehydrateSnapshot;
      }>('conversation.load', {
        userId,
        conversationRef,
      });
      return snapshot?.rehydrate ?? {
        conversationRef,
        revisionId: '',
        messages: [],
      };
    },
    async listMetadata(options?: ListConversationOptions): Promise<ConversationMetadata[]> {
      const metadata = await invokeWindieCommand<ConversationMetadata[]>('conversations.list', {
        userId,
        limit: options?.limit,
      });
      return Array.isArray(metadata) ? metadata : [];
    },
    async searchMetadata(options: SearchConversationOptions): Promise<ConversationMetadata[]> {
      const metadata = await invokeWindieCommand<ConversationMetadata[]>('conversations.search', {
        userId,
        query: options.query,
        limit: options.limit,
      });
      return Array.isArray(metadata) ? metadata : [];
    },
    async deleteConversation(conversationRef: string): Promise<void> {
      await invokeWindieCommand('conversations.delete', {
        userId,
        conversationRef,
      });
    },
    async clearConversations(): Promise<void> {
      await invokeWindieCommand('conversations.clearAll', {
        userId,
      });
    },
    async getRevision(conversationRef: string) {
      return invokeWindieCommand('conversation.getRevision', {
        userId,
        conversationRef,
      });
    },
  };
}

export async function appendTranscriptProjectionEntry(
  userId: string,
  entry: TranscriptProjectionAppendEntry,
  deps: DesktopConversationStoreDeps = {},
): Promise<void> {
  const store = createDesktopConversationStore(userId, deps);
  const revision = await store.getRevision(entry.conversationRef);
  await store.appendEvent(projectionEntryToConversationEvent(
    entry.conversationRef,
    revision.revisionId,
    entry,
    Date.now(),
    resolveDesktopConversationStoreDeps(deps),
  ));
}

export async function rewriteTranscriptProjection({
  conversationRef,
  userId,
  entries,
  rehydrateEntries,
  deps,
}: {
  conversationRef: string;
  userId: string;
  entries: TranscriptProjectionRewriteEntry[];
  rehydrateEntries?: TranscriptProjectionRewriteEntry[];
  deps?: DesktopConversationStoreDeps;
}): Promise<RehydrateSnapshot> {
  const store = createDesktopConversationStore(userId, deps);
  const revisionId = `rev-rewrite-${conversationRef}-${Date.now()}`;
  const resolvedDeps = resolveDesktopConversationStoreDeps(deps);
  await store.rewriteConversation({
    conversationRef,
    baseRevisionId: '',
    newRevisionId: revisionId,
    preservedEvents: entries.map((entry, index) => (
      projectionEntryToConversationEvent(conversationRef, revisionId, entry, index, resolvedDeps)
    )),
    removedEventIds: [],
    reason: 'transcript_projection_rewrite',
  });

  return buildRehydrateSnapshotFromTranscriptProjectionEntries({
    conversationRef,
    entries: rehydrateEntries ?? entries,
  });
}
