/**
 * Covers Agent SDK file conversation store behavior in the frontend test suite.
 */

import { promises as fsPromises } from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  createConversationEvent,
  FileConversationStore,
  type ConversationEvent,
} from '../../packages/windie-sdk-js/src';

function event(
  type: ConversationEvent['type'],
  payload: Record<string, unknown> = {},
  overrides: Partial<ConversationEvent> = {},
): ConversationEvent {
  return createConversationEvent({
    type,
    conversationRef: overrides.conversationRef ?? 'conv-file-store',
    revisionId: overrides.revisionId ?? 'rev-1',
    turnRef: overrides.turnRef ?? 'turn-1',
    source: overrides.source ?? 'sdk',
    payload,
    eventId: overrides.eventId,
    timestamp: overrides.timestamp,
  });
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value?: T | PromiseLike<T>) => void;
} {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('FileConversationStore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'windie-file-store-'));
  });

  afterEach(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  test('persists events, projections, and metadata across store instances', async () => {
    const store = new FileConversationStore({ directory: tempDir });
    const userEvent = event('user_message', { text: 'remember this' }, {
      eventId: 'evt-user',
      timestamp: '2026-05-15T12:00:00.000Z',
    });
    const assistantEvent = event('assistant_message', { text: 'stored on disk' }, {
      eventId: 'evt-assistant',
      timestamp: '2026-05-15T12:00:01.000Z',
    });

    await store.appendEvents([userEvent, assistantEvent, assistantEvent]);

    const reopened = new FileConversationStore({ directory: tempDir });
    expect(await reopened.loadEvents('conv-file-store')).toHaveLength(2);
    expect(await reopened.loadForDisplay('conv-file-store')).toMatchObject({
      conversationRef: 'conv-file-store',
      messages: [
        expect.objectContaining({
          sender: 'user',
          text: 'remember this',
        }),
        expect.objectContaining({
          sender: 'assistant',
          text: 'stored on disk',
        }),
      ],
    });
    expect(await reopened.loadForRehydrate('conv-file-store')).toMatchObject({
      conversationRef: 'conv-file-store',
      messages: [
        expect.objectContaining({
          role: 'user',
          content: 'remember this',
        }),
        expect.objectContaining({
          role: 'assistant',
          content: 'stored on disk',
        }),
      ],
    });
    expect(await reopened.listMetadata()).toEqual([
      expect.objectContaining({
        conversationRef: 'conv-file-store',
        title: 'remember this',
        lastMessage: 'stored on disk',
        eventCount: 2,
      }),
    ]);
  });

  test('uses only complete compacted replay snapshots for rehydrate', async () => {
    const store = new FileConversationStore({ directory: tempDir });
    await store.appendEvent(event('user_message', { text: 'full history' }, {
      eventId: 'evt-history',
      timestamp: '2026-05-15T12:00:00.000Z',
    }));
    await store.replaceCompactedReplay({
      generationId: 'partial-generation',
      conversationRef: 'conv-file-store',
      sourceRevisionId: 'rev-compact',
      sourceTurnRef: 'turn-compact',
      createdAt: '2026-05-15T12:00:00.000Z',
      entries: [{ role: 'user', content: 'partial summary' }],
      entryCount: 2,
      complete: true,
    });

    expect(await store.loadForRehydrate('conv-file-store')).toMatchObject({
      messages: [
        expect.objectContaining({
          content: 'full history',
        }),
      ],
    });

    await store.replaceCompactedReplay({
      generationId: 'complete-generation',
      conversationRef: 'conv-file-store',
      sourceRevisionId: 'rev-compact',
      sourceTurnRef: 'turn-compact',
      createdAt: '2026-05-15T12:00:01.000Z',
      entries: [{ role: 'user', content: 'complete summary' }],
      entryCount: 1,
      complete: true,
    });

    const reopened = new FileConversationStore({ directory: tempDir });
    expect(await reopened.loadForRehydrate('conv-file-store')).toMatchObject({
      replayGenerationId: 'complete-generation',
      messages: [
        expect.objectContaining({
          content: 'complete summary',
        }),
      ],
    });
  });

  test('paginates metadata after the cursor conversation', async () => {
    const store = new FileConversationStore({ directory: tempDir });
    await store.appendEvents([
      event('user_message', { text: 'oldest' }, {
        conversationRef: 'conv-oldest',
        timestamp: '2026-05-15T10:00:00.000Z',
      }),
      event('user_message', { text: 'middle' }, {
        conversationRef: 'conv-middle',
        timestamp: '2026-05-15T11:00:00.000Z',
      }),
      event('user_message', { text: 'newest' }, {
        conversationRef: 'conv-newest',
        timestamp: '2026-05-15T12:00:00.000Z',
      }),
    ]);

    expect((await store.listMetadata({ limit: 1 })).map(item => item.conversationRef)).toEqual([
      'conv-newest',
    ]);
    expect((await store.listMetadata({ cursor: 'conv-newest', limit: 2 })).map(item => item.conversationRef)).toEqual([
      'conv-middle',
      'conv-oldest',
    ]);
  });

  test('preserves append order instead of sorting by timestamp or event id', async () => {
    const store = new FileConversationStore({ directory: tempDir });
    const first = event('tool_call', { toolName: 'read_file', requestId: 'req-1' }, {
      eventId: 'z-appended-first',
      timestamp: '2026-05-15T12:00:10.000Z',
    });
    const second = event('tool_output', { toolName: 'read_file', requestId: 'req-1', text: 'result' }, {
      eventId: 'a-appended-second',
      timestamp: '2026-05-15T12:00:00.000Z',
    });

    await store.appendEvents([first, second]);

    const reopened = new FileConversationStore({ directory: tempDir });
    expect((await reopened.loadEvents('conv-file-store')).map(item => item.eventId)).toEqual([
      'z-appended-first',
      'a-appended-second',
    ]);
  });

  test('serializes overlapping appends for the same conversation', async () => {
    const store = new FileConversationStore({ directory: tempDir });
    const first = event('user_message', { text: 'first' }, {
      eventId: 'evt-first',
      timestamp: '2026-05-15T12:00:00.000Z',
    });
    const second = event('assistant_message', { text: 'second' }, {
      eventId: 'evt-second',
      timestamp: '2026-05-15T12:00:01.000Z',
    });
    const firstWriteStarted = deferred();
    const releaseFirstWrite = deferred();
    let blockedFirstWrite = false;
    let secondWriteEnteredWhileFirstHeld = false;
    let storedEvents: ConversationEvent[] = [];
    const internals = store as unknown as {
      readConversation(conversationRef: string): Promise<{
        version: 1;
        conversationRef: string;
        events: ConversationEvent[];
        replay: null;
        revision: null;
      }>;
      writeConversation(file: {
        version: 1;
        conversationRef: string;
        events: ConversationEvent[];
        replay: null;
        revision: null;
      }): Promise<void>;
    };
    internals.readConversation = jest.fn(async conversationRef => ({
      version: 1,
      conversationRef,
      events: [...storedEvents],
      replay: null,
      revision: null,
    }));
    internals.writeConversation = jest.fn(async file => {
      const eventIds = file.events.map(item => item.eventId);
      if (!blockedFirstWrite && eventIds.length === 1 && eventIds[0] === 'evt-first') {
        blockedFirstWrite = true;
        firstWriteStarted.resolve();
        await releaseFirstWrite.promise;
      } else if (eventIds.includes('evt-second')) {
        secondWriteEnteredWhileFirstHeld = blockedFirstWrite && storedEvents.length === 0;
      }
      storedEvents = [...file.events];
    });

    const firstAppend = store.appendEvent(first);
    await firstWriteStarted.promise;

    const secondAppend = store.appendEvent(second);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(secondWriteEnteredWhileFirstHeld).toBe(false);

    releaseFirstWrite.resolve();
    await Promise.all([firstAppend, secondAppend]);

    expect(storedEvents.map(item => item.eventId)).toEqual(['evt-first', 'evt-second']);
  });

  test('rewrites conversations without leaving removed events in the active revision', async () => {
    const store = new FileConversationStore({ directory: tempDir });
    const first = event('user_message', { text: 'original' }, {
      eventId: 'evt-first',
      timestamp: '2026-05-15T12:00:00.000Z',
    });
    const second = event('assistant_message', { text: 'remove me' }, {
      eventId: 'evt-second',
      timestamp: '2026-05-15T12:00:01.000Z',
    });
    const rewrite = event(
      'conversation_rewritten',
      {
        reason: 'edit_resend',
        removedEventIds: [second.eventId],
      },
      {
        revisionId: 'rev-2',
        eventId: 'evt-rewrite',
        timestamp: '2026-05-15T12:00:02.000Z',
      },
    );
    await store.appendEvents([first, second]);

    await store.rewriteConversation({
      conversationRef: 'conv-file-store',
      baseRevisionId: 'rev-1',
      newRevisionId: 'rev-2',
      cutAfterEventId: first.eventId,
      replacementUserMessage: { text: 'replacement' },
      preservedEvents: [first, rewrite],
      removedEventIds: [second.eventId],
      reason: 'edit_resend',
    });

    const reopened = new FileConversationStore({ directory: tempDir });
    expect(await reopened.loadEvents('conv-file-store')).toEqual([first, rewrite]);
    expect(await reopened.getRevision('conv-file-store')).toMatchObject({
      conversationRef: 'conv-file-store',
      revisionId: 'rev-2',
    });
  });
});
