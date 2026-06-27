/** @jest-environment node */

const {
  createConversationEvent,
  InMemoryConversationStore,
  SdkConversationRuntime,
} = require('../../packages/windie-sdk-js/cjs/index.js');

function createMockAgentRuntimeTransport(overrides = {}) {
  return {
    connect: jest.fn(async () => undefined),
    handshake: jest.fn(async () => undefined),
    sendQuery: jest.fn(async () => 'query-unused'),
    sendToolResult: jest.fn(async () => undefined),
    sendToolBundleResult: jest.fn(async () => undefined),
    rehydrateConversation: jest.fn(async () => undefined),
    compactHistory: jest.fn(async () => 'compact-unused'),
    wakewordDetected: jest.fn(async () => 'wakeword-unused'),
    updateSettings: jest.fn(async () => 'settings-unused'),
    listModels: jest.fn(async () => 'models-unused'),
    stop: jest.fn(async () => undefined),
    subscribe: jest.fn(() => () => undefined),
    close: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('Agent SDK CJS conversation runtime', () => {
  test('loadDisplayTimeline includes same-revision send rows after an edit replacement', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-cjs-runtime',
        revisionId: 'rev-old',
        eventId: 'user-keep',
        payload: { text: 'keep this' },
      }),
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-cjs-runtime',
        revisionId: 'rev-old',
        eventId: 'user-edit',
        payload: { text: 'old text' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-cjs-runtime',
        revisionId: 'rev-old',
        eventId: 'assistant-stale',
        payload: { text: 'stale answer' },
      }),
    ]);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-cjs-runtime',
      store,
      transport: createMockAgentRuntimeTransport(),
    });

    await runtime.load();
    const baseTimeline = await runtime.loadDisplayTimeline();
    const checkpoint = await runtime.replaceRows({
      rows: baseTimeline.rows.slice(0, 1),
      reason: 'user_edit',
      baseRevisionId: baseTimeline.revisionId,
    });
    await runtime.send({
      text: 'new text',
      turnRef: 'turn-edited',
    });

    const displayTimeline = await runtime.loadDisplayTimeline();
    expect(displayTimeline.revisionId).toBe(checkpoint.revisionId);
    expect(displayTimeline.rows.map(row => row.content)).toEqual([
      'keep this',
      'new text',
    ]);
    expect(displayTimeline.rows[1]).toEqual(expect.objectContaining({
      revisionId: checkpoint.revisionId,
      turnRef: 'turn-edited',
    }));
  });

  test('fork without cutAfterRowId copies the whole selected revision', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-cjs-fork',
        revisionId: 'rev-fork-source',
        eventId: 'fork-user-1',
        payload: { text: 'first question' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-cjs-fork',
        revisionId: 'rev-fork-source',
        eventId: 'fork-assistant-1',
        payload: { text: 'first answer' },
      }),
    ]);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-cjs-fork',
      revisionId: 'rev-fork-source',
      store,
      transport: createMockAgentRuntimeTransport(),
    });
    await runtime.load();
    const sourceTimeline = await runtime.loadDisplayTimeline({
      revisionId: 'rev-fork-source',
    });

    const fork = await runtime.fork({
      sourceRevisionId: 'rev-fork-source',
    });
    const forkTimeline = await store.loadDisplayTimeline({
      conversationRef: fork.conversationRef,
      revisionId: fork.revisionId,
    });

    expect(fork.conversationRef).toMatch(/^conv_/);
    expect(fork.conversationRef).not.toBe('conv-sdk-cjs-fork');
    expect(fork.cutAfterRowId).toBe(sourceTimeline.rows[sourceTimeline.rows.length - 1].id);
    expect(forkTimeline.rows.map(row => row.content)).toEqual([
      'first question',
      'first answer',
    ]);
  });

  test('send persists display-safe visual metadata on the initial user display row', async () => {
    const store = new InMemoryConversationStore();
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-cjs-runtime',
      store,
      transport: createMockAgentRuntimeTransport({
        sendQuery: jest.fn(async () => 'query-replay-visual'),
      }),
    });
    const displayAttachment = {
      id: 'legacy-ui-attachment',
      kind: 'image',
      source: 'user_included',
      status: 'ready',
      screenshotRef: 'artifact-replay-one',
      filename: 'one.png',
    };

    await runtime.send({
      text: 'review the included image',
      turnRef: 'turn-replay-visual',
      payload: {
        screenshot_refs: ['artifact-replay-one'],
        attachment_filenames: ['one.png'],
      },
      metadata: {
        attachments: [displayAttachment],
      },
    });

    await expect(store.loadDisplayRows('conv-sdk-cjs-runtime')).resolves.toEqual([
      expect.objectContaining({
        id: 'turn-replay-visual-sdk-evt-000002-user_message',
        role: 'user',
        type: 'user_message',
        content: 'review the included image',
        metadata: expect.objectContaining({
          screenshot_refs: ['artifact-replay-one'],
          attachments: [displayAttachment],
          raw: expect.objectContaining({
            screenshot_refs: ['artifact-replay-one'],
            attachment_filenames: ['one.png'],
            attachments: [displayAttachment],
          }),
        }),
      }),
    ]);
  });
});
