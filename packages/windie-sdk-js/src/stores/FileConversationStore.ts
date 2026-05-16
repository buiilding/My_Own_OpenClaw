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
} from '../conversation/types.js';
import {
  buildDisplayConversation,
  buildRehydrateSnapshot,
} from '../projections/conversationProjections.js';

type NodeFsPromisesLike = {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, content: string, encoding: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
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
    updatedAt: lastEvent?.timestamp ?? new Date(0).toISOString(),
  };
}

function applyMetadataPagination<T extends { conversationRef: string }>(
  metadata: T[],
  options: ListConversationOptions,
): T[] {
  const cursorIndex = typeof options.cursor === 'string'
    ? metadata.findIndex(entry => entry.conversationRef === options.cursor)
    : -1;
  const afterCursor = cursorIndex >= 0 ? metadata.slice(cursorIndex + 1) : metadata;
  return typeof options.limit === 'number' ? afterCursor.slice(0, options.limit) : afterCursor;
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
    revision: payload.revision ?? buildRevision(conversationRef, events),
  };
}

export class FileConversationStore implements ConversationStore {
  private modulesPromise?: Promise<FileConversationStoreModules>;

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
    }
  }

  async rewriteConversation(plan: ConversationRewritePlan): Promise<void> {
    const events = [...plan.preservedEvents];
    const stored = await this.readConversation(plan.conversationRef);
    await this.writeConversation({
      ...stored,
      conversationRef: plan.conversationRef,
      events,
      revision: {
        conversationRef: plan.conversationRef,
        revisionId: plan.newRevisionId,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
    if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
      return;
    }
    const stored = await this.readConversation(snapshot.conversationRef);
    await this.writeConversation({
      ...stored,
      conversationRef: snapshot.conversationRef,
      replay: {
        ...snapshot,
        active: true,
      },
    });
  }

  async loadEvents(conversationRef: string): Promise<ConversationEvent[]> {
    return (await this.readConversation(conversationRef)).events;
  }

  async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
    return buildDisplayConversation(await this.loadEvents(conversationRef));
  }

  async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
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
    return buildRehydrateSnapshot(await this.loadEvents(conversationRef));
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
      metadata.push({
        conversationRef,
        revisionId: revision.revisionId,
        title: eventText(stored.events.find(event => event.type === 'user_message')) ?? conversationRef,
        lastMessage: eventText(lastTextEvent(stored.events)),
        updatedAt: revision.updatedAt,
        eventCount: stored.events.length,
      });
    }
    const sorted = metadata.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return applyMetadataPagination(sorted, options);
  }

  async getRevision(conversationRef: string): Promise<ConversationRevision> {
    const stored = await this.readConversation(conversationRef);
    return stored.revision ?? buildRevision(conversationRef, stored.events);
  }

  async loadCompactedReplay(conversationRef: string): Promise<CompactedReplaySnapshot | null> {
    return (await this.readConversation(conversationRef)).replay ?? null;
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
