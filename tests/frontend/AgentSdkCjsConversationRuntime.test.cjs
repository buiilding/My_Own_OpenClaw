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
});
