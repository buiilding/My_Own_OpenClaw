/**
 * Stores and retrieves file conversation state for the TypeScript SDK runtime.
 */

import type {
  CompactedReplaySnapshot,
  ConversationEvent,
  ConversationMetadata,
  ConversationRevision,
  ConversationStore,
  DisplayTimelineCheckpoint,
  DisplayConversation,
  ListConversationOptions,
  ModelHistoryCheckpoint,
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
import { latestCompactedReplayFromEvents } from './compactedReplayEvents.js';
import { rehydrateSnapshotFromModelHistoryCheckpoint } from '../runtime/modelHistoryPayload.js';
import {
  displayConversationFromTimeline,
  displayRowsFromTimeline,
} from './displayTimelineStoreProjection.js';

type NodeFsPromisesLike = {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, content: string, encoding: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  unlink(path: string): Promise<void>;
};

type NodePathLike = {
  join(...parts: string[]): string;
};

type FileConversationStoreModules = {
  fs: NodeFsPromisesLike;
  path: NodePathLike;
};

type StoredConversationFile = {
  version: 1;
  conversationRef: string;
  events: ConversationEvent[];
  replay?: CompactedReplaySnapshot | null;
  modelHistory?: ModelHistoryCheckpoint[];
  displayTimeline?: DisplayTimelineCheckpoint[];
  revision?: ConversationRevision | null;
};

export type FileConversationStoreOptions = {
  directory: string;
};

async function importNodeModule<TModule>(specifier: string): Promise<TModule> {
  return import(/* @vite-ignore */ specifier) as Promise<TModule>;
}

async function loadNodeFileModules(): Promise<FileConversationStoreModules> {
  const [fs, path] = await Promise.all([
    importNodeModule<NodeFsPromisesLike>('node:fs/promises'),
    importNodeModule<NodePathLike>('node:path'),
  ]);
  return { fs, path };
}

function conversationFilename(conversationRef: string): string {
  return `${encodeURIComponent(conversationRef)}.json`;
}

function isConversationEvent(value: unknown): value is ConversationEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const event = value as Partial<ConversationEvent>;
  return typeof event.eventId === 'string'
    && typeof event.type === 'string'
    && typeof event.conversationRef === 'string'
    && typeof event.revisionId === 'string'
    && typeof event.timestamp === 'string'
    && typeof event.source === 'string'
    && Boolean(event.payload)
    && typeof event.payload === 'object'
    && !Array.isArray(event.payload);
}

function eventText(event: ConversationEvent | undefined): string | null {
  if (!event) {
    return null;
  }
  if (typeof event.payload.text === 'string') {
    return event.payload.text;
  }
  if (typeof event.payload.content === 'string') {
    return event.payload.content;
  }
  return null;
}

function lastTextEvent(events: ConversationEvent[]): ConversationEvent | undefined {
  return [...events].reverse().find(event => (
    (event.type === 'user_message' || event.type === 'assistant_message')
    && (typeof event.payload.text === 'string' || typeof event.payload.content === 'string')
  ));
}

function buildRevision(conversationRef: string, events: ConversationEvent[]): ConversationRevision {
  const lastEvent = events[events.length - 1];
  return {
    conversationRef,
    revisionId: lastEvent?.revisionId ?? 'rev-empty',
    operation: 'send',
    createdAt: events[0]?.timestamp ?? new Date(0).toISOString(),
    updatedAt: lastEvent?.timestamp ?? new Date(0).toISOString(),
    active: true,
  };
}

function revisionOperationFromModelHistory(checkpoint: ModelHistoryCheckpoint): ConversationRevision['operation'] {
  return checkpoint.rows.some(row => row.messageType === 'context_compaction')
    ? 'compact'
    : 'send';
}

function normalizeStoredFile(conversationRef: string, raw: unknown): StoredConversationFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      version: 1,
      conversationRef,
      events: [],
      replay: null,
      revision: buildRevision(conversationRef, []),
    };
  }
  const payload = raw as Partial<StoredConversationFile>;
  const events = Array.isArray(payload.events)
    ? payload.events.filter(isConversationEvent)
    : [];
  return {
    version: 1,
    conversationRef: typeof payload.conversationRef === 'string'
      ? payload.conversationRef
      : conversationRef,
    events,
    replay: payload.replay ?? null,
    modelHistory: Array.isArray(payload.modelHistory)
      ? payload.modelHistory
      : [],
    displayTimeline: Array.isArray(payload.displayTimeline)
      ? payload.displayTimeline
      : [],
    revision: payload.revision ?? buildRevision(conversationRef, events),
  };
}

export class FileConversationStore implements ConversationStore {
  private modulesPromise?: Promise<FileConversationStoreModules>;
  private readonly conversationMutationChains = new Map<string, Promise<void>>();

  constructor(private readonly options: FileConversationStoreOptions) {}

  async appendEvent(event: ConversationEvent): Promise<void> {
    await this.appendEvents([event]);
  }

  async appendEvents(events: ConversationEvent[]): Promise<void> {
    const groupedEvents = new Map<string, ConversationEvent[]>();
    for (const event of events) {
      const group = groupedEvents.get(event.conversationRef) ?? [];
      group.push(event);
      groupedEvents.set(event.conversationRef, group);
    }
    for (const [conversationRef, nextEvents] of groupedEvents) {
      await this.runConversationMutation(conversationRef, async () => {
        const stored = await this.readConversation(conversationRef);
        const knownIds = new Set(stored.events.map(event => event.eventId));
        const uniqueNextEvents = nextEvents.filter(event => {
          if (knownIds.has(event.eventId)) {
            return false;
          }
          knownIds.add(event.eventId);
          return true;
        });
        const merged = [
          ...stored.events,
          ...uniqueNextEvents,
        ];
        await this.writeConversation({
          ...stored,
          conversationRef,
          events: merged,
          revision: buildRevision(conversationRef, merged),
        });
      });
    }
  }

  async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
    if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
      return;
    }
    await this.runConversationMutation(snapshot.conversationRef, async () => {
      const stored = await this.readConversation(snapshot.conversationRef);
      await this.writeConversation({
        ...stored,
        conversationRef: snapshot.conversationRef,
        replay: {
          ...snapshot,
          active: true,
        },
      });
    });
  }

  async loadEvents(conversationRef: string): Promise<ConversationEvent[]> {
    return (await this.readConversation(conversationRef)).events;
  }

  async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
    const stored = await this.readConversation(conversationRef);
    const timeline = await this.loadDisplayTimeline({ conversationRef });
    if (!timeline) {
      return buildDisplayConversation(stored.events);
    }
    return displayConversationFromTimeline(timeline, stored.events);
  }

  async loadDisplayRows(conversationRef: string): Promise<SdkDisplayRow[]> {
    const stored = await this.readConversation(conversationRef);
    const timeline = await this.loadDisplayTimeline({ conversationRef });
    if (!timeline) {
      return buildDisplayRows(stored.events);
    }
    return displayRowsFromTimeline(timeline, stored.events);
  }

  async replaceDisplayTimeline(checkpoint: DisplayTimelineCheckpoint): Promise<void> {
    await this.runConversationMutation(checkpoint.conversationRef, async () => {
      const stored = await this.readConversation(checkpoint.conversationRef);
      const existing = stored.displayTimeline ?? [];
      await this.writeConversation({
        ...stored,
        conversationRef: checkpoint.conversationRef,
        displayTimeline: [
          ...existing.filter(entry => entry.revisionId !== checkpoint.revisionId),
          {
            ...checkpoint,
            rows: [...checkpoint.rows],
          },
        ],
        revision: {
          conversationRef: checkpoint.conversationRef,
          revisionId: checkpoint.revisionId,
          parentRevisionId: checkpoint.baseRevisionId ?? null,
          operation: checkpoint.reason === 'user_edit' ? 'edit' : checkpoint.reason ?? 'send',
          displayTimelineId: checkpoint.revisionId,
          createdAt: checkpoint.createdAt,
          updatedAt: checkpoint.createdAt,
          active: true,
        },
      });
    });
  }

  async loadDisplayTimeline(input: {
    conversationRef: string;
    revisionId?: string | null;
  }): Promise<DisplayTimelineCheckpoint | null> {
    const stored = await this.readConversation(input.conversationRef);
    const checkpoints = stored.displayTimeline ?? [];
    if (!input.revisionId) {
      const activeRevisionId = stored.revision?.displayTimelineId
        ?? stored.revision?.revisionId
        ?? null;
      const active = activeRevisionId
        ? checkpoints.find(checkpoint => checkpoint.revisionId === activeRevisionId)
        : null;
      if (active) {
        return { ...active, rows: [...active.rows] };
      }
    }
    const candidates = input.revisionId
      ? checkpoints.filter(checkpoint => checkpoint.revisionId === input.revisionId)
      : checkpoints;
    const latest = [...candidates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    return latest ? { ...latest, rows: [...latest.rows] } : null;
  }

  async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
    const stored = await this.readConversation(conversationRef);
    const activeRevisionId = stored.revision?.revisionId ?? null;
    const modelHistoryCheckpoint = await this.loadModelHistory({
      conversationRef,
      revisionId: activeRevisionId,
    });
    const modelHistorySnapshot = modelHistoryCheckpoint
      ? rehydrateSnapshotFromModelHistoryCheckpoint(modelHistoryCheckpoint)
      : null;
    if (modelHistorySnapshot) {
      return modelHistorySnapshot;
    }
    const compactedReplay = await this.loadCompactedReplay(conversationRef);
    if (
      compactedReplay?.complete
      && compactedReplay.active !== false
      && compactedReplay.entryCount === compactedReplay.entries.length
    ) {
      return {
        conversationRef,
        revisionId: compactedReplay.sourceRevisionId,
        messages: compactedReplay.entries,
        replayGenerationId: compactedReplay.generationId,
      };
    }
    return buildRehydrateSnapshot(stored.events);
  }

  async replaceModelHistory(checkpoint: ModelHistoryCheckpoint): Promise<void> {
    await this.runConversationMutation(checkpoint.conversationRef, async () => {
      const stored = await this.readConversation(checkpoint.conversationRef);
      const existing = stored.modelHistory ?? [];
      const existingRevision = stored.revision ?? buildRevision(checkpoint.conversationRef, stored.events);
      const modelHistoryOperation = revisionOperationFromModelHistory(checkpoint);
      await this.writeConversation({
        ...stored,
        conversationRef: checkpoint.conversationRef,
        modelHistory: [
          ...existing.filter(entry => !(
            entry.revisionId === checkpoint.revisionId
            && entry.checkpointId === checkpoint.checkpointId
          )),
          {
            ...checkpoint,
            rows: [...checkpoint.rows],
          },
        ],
        revision: {
          ...existingRevision,
          conversationRef: checkpoint.conversationRef,
          revisionId: checkpoint.revisionId,
          operation: modelHistoryOperation === 'send'
            && existingRevision.operation
            && existingRevision.operation !== 'send'
            ? existingRevision.operation
            : modelHistoryOperation,
          modelHistoryCheckpointId: checkpoint.checkpointId,
          updatedAt: checkpoint.createdAt,
          active: true,
        },
      });
    });
  }

  async loadModelHistory(input: {
    conversationRef: string;
    revisionId?: string | null;
  }): Promise<ModelHistoryCheckpoint | null> {
    const stored = await this.readConversation(input.conversationRef);
    const checkpoints = stored.modelHistory ?? [];
    const candidates = input.revisionId
      ? checkpoints.filter(checkpoint => checkpoint.revisionId === input.revisionId)
      : checkpoints;
    const latest = [...candidates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    return latest ? { ...latest, rows: [...latest.rows] } : null;
  }

  async listMetadata(options: ListConversationOptions = {}): Promise<ConversationMetadata[]> {
    const { fs } = await this.modules();
    await this.ensureDirectory();
    const files = await fs.readdir(this.options.directory);
    const metadata: ConversationMetadata[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      const conversationRef = decodeURIComponent(file.slice(0, -5));
      const stored = await this.readConversation(conversationRef);
      const revision = stored.revision ?? buildRevision(conversationRef, stored.events);
      const latestDisplayTimeline = [...(stored.displayTimeline ?? [])]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
      const firstDisplayUserRow = latestDisplayTimeline?.rows.find(row => row.role === 'user') ?? null;
      const lastDisplayTextRow = latestDisplayTimeline
        ? [...latestDisplayTimeline.rows].reverse().find(row => typeof row.content === 'string') ?? null
        : null;
      const eventUpdatedAt = revision.updatedAt;
      const displayIsCurrent = latestDisplayTimeline
        ? Date.parse(latestDisplayTimeline.createdAt) >= Date.parse(eventUpdatedAt)
        : false;
      const eventLastMessage = eventText(lastTextEvent(stored.events));
      const displayLastMessage = typeof lastDisplayTextRow?.content === 'string'
        ? lastDisplayTextRow.content
        : null;
      metadata.push({
        conversationRef,
        revisionId: displayIsCurrent ? latestDisplayTimeline?.revisionId ?? revision.revisionId : revision.revisionId,
        title: (typeof firstDisplayUserRow?.content === 'string' ? firstDisplayUserRow.content : null)
          ?? eventText(stored.events.find(event => event.type === 'user_message'))
          ?? conversationRef,
        lastMessage: displayIsCurrent
          ? displayLastMessage ?? eventLastMessage
          : eventLastMessage ?? displayLastMessage,
        updatedAt: displayIsCurrent ? latestDisplayTimeline?.createdAt ?? eventUpdatedAt : eventUpdatedAt,
        eventCount: stored.events.length,
      });
    }
    const sorted = metadata.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return applyConversationMetadataPagination(sorted, options);
  }

  async searchMetadata(options: SearchConversationOptions): Promise<ConversationMetadata[]> {
    return searchConversationMetadata(await this.listMetadata(), options);
  }

  async deleteConversation(conversationRef: string): Promise<void> {
    await this.runConversationMutation(conversationRef, async () => {
      const { fs } = await this.modules();
      try {
        await fs.unlink(await this.filePath(conversationRef));
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'ENOENT') {
          throw error;
        }
      }
    });
  }

  async clearConversations(): Promise<void> {
    const { fs, path } = await this.modules();
    await this.ensureDirectory();
    const files = await fs.readdir(this.options.directory);
    await Promise.all(files
      .filter(file => file.endsWith('.json'))
      .map(file => fs.unlink(path.join(this.options.directory, file))));
    this.conversationMutationChains.clear();
  }

  async getRevision(conversationRef: string): Promise<ConversationRevision> {
    const stored = await this.readConversation(conversationRef);
    return stored.revision ?? buildRevision(conversationRef, stored.events);
  }

  async listRevisions(options: { conversationRef: string; limit?: number }): Promise<ConversationRevision[]> {
    const stored = await this.readConversation(options.conversationRef);
    const activeRevision = stored.revision ?? buildRevision(options.conversationRef, stored.events);
    const revisions = new Map<string, ConversationRevision>();
    if (activeRevision.revisionId) {
      revisions.set(activeRevision.revisionId, activeRevision);
    }
    for (const checkpoint of stored.displayTimeline ?? []) {
      revisions.set(checkpoint.revisionId, {
        ...revisions.get(checkpoint.revisionId),
        conversationRef: options.conversationRef,
        revisionId: checkpoint.revisionId,
        parentRevisionId: checkpoint.baseRevisionId ?? revisions.get(checkpoint.revisionId)?.parentRevisionId ?? null,
        operation: checkpoint.reason === 'user_edit' ? 'edit' : checkpoint.reason ?? revisions.get(checkpoint.revisionId)?.operation ?? 'send',
        displayTimelineId: checkpoint.revisionId,
        createdAt: revisions.get(checkpoint.revisionId)?.createdAt ?? checkpoint.createdAt,
        updatedAt: revisions.get(checkpoint.revisionId)?.updatedAt ?? checkpoint.createdAt,
        active: activeRevision.revisionId === checkpoint.revisionId,
      });
    }
    for (const checkpoint of stored.modelHistory ?? []) {
      revisions.set(checkpoint.revisionId, {
        ...revisions.get(checkpoint.revisionId),
        conversationRef: options.conversationRef,
        revisionId: checkpoint.revisionId,
        operation: revisions.get(checkpoint.revisionId)?.operation ?? revisionOperationFromModelHistory(checkpoint),
        modelHistoryCheckpointId: checkpoint.checkpointId,
        createdAt: revisions.get(checkpoint.revisionId)?.createdAt ?? checkpoint.createdAt,
        updatedAt: checkpoint.createdAt,
        active: activeRevision.revisionId === checkpoint.revisionId,
      });
    }
    const sorted = Array.from(revisions.values())
      .sort((a, b) => {
        if (a.active && !b.active) {
          return -1;
        }
        if (!a.active && b.active) {
          return 1;
        }
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
          || b.revisionId.localeCompare(a.revisionId);
      });
    return typeof options.limit === 'number' && options.limit > 0
      ? sorted.slice(0, options.limit)
      : sorted;
  }

  async loadCompactedReplay(conversationRef: string): Promise<CompactedReplaySnapshot | null> {
    const stored = await this.readConversation(conversationRef);
    return stored.replay ?? latestCompactedReplayFromEvents(stored.events);
  }

  private async modules(): Promise<FileConversationStoreModules> {
    this.modulesPromise ??= loadNodeFileModules();
    return this.modulesPromise;
  }

  private async ensureDirectory(): Promise<void> {
    const { fs } = await this.modules();
    await fs.mkdir(this.options.directory, { recursive: true });
  }

  private async filePath(conversationRef: string): Promise<string> {
    const { path } = await this.modules();
    return path.join(this.options.directory, conversationFilename(conversationRef));
  }

  private async runConversationMutation<T>(
    conversationRef: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.conversationMutationChains.get(conversationRef) ?? Promise.resolve();
    let releaseCurrent: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const chain = previous.catch(() => undefined).then(() => current);
    this.conversationMutationChains.set(conversationRef, chain);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (this.conversationMutationChains.get(conversationRef) === chain) {
        this.conversationMutationChains.delete(conversationRef);
      }
    }
  }

  private async readConversation(conversationRef: string): Promise<StoredConversationFile> {
    const { fs } = await this.modules();
    await this.ensureDirectory();
    try {
      const content = await fs.readFile(await this.filePath(conversationRef), 'utf8');
      return normalizeStoredFile(conversationRef, JSON.parse(content));
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'ENOENT') {
        return normalizeStoredFile(conversationRef, null);
      }
      throw error;
    }
  }

  private async writeConversation(file: StoredConversationFile): Promise<void> {
    const { fs } = await this.modules();
    await this.ensureDirectory();
    const target = await this.filePath(file.conversationRef);
    const temporary = `${target}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, target);
  }
}
