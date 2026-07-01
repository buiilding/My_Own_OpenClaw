/** @jest-environment node */

const {
  buildDisplayRows,
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
  test('CJS display rows attach prompt transparency metadata to the matching user row', () => {
    const user = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-sdk-cjs-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'ui',
      payload: { text: 'hello' },
    });
    const systemPrompt = createConversationEvent({
      eventId: 'evt-system-prompt',
      type: 'system_prompt',
      conversationRef: 'conv-sdk-cjs-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      payload: { content: 'system prompt' },
    });
    const userMetadata = createConversationEvent({
      eventId: 'evt-user-message-full',
      type: 'user_message_metadata',
      conversationRef: 'conv-sdk-cjs-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      payload: {
        content: '<user_query>hello</user_query>',
        metadata: { context_type: 'initial' },
      },
    });
    const toolSchemas = createConversationEvent({
      eventId: 'evt-tool-schemas',
      type: 'tool_schemas_metadata',
      conversationRef: 'conv-sdk-cjs-runtime',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      payload: {
        toolSchemas: [{
          type: 'function',
          function: {
            name: 'read_file',
            parameters: { type: 'object', properties: {} },
          },
        }],
      },
    });

    expect(buildDisplayRows([
      user,
      systemPrompt,
      userMetadata,
      toolSchemas,
    ])).toEqual([
      expect.objectContaining({
        id: 'evt-user',
        metadata: expect.objectContaining({
          systemPrompt: {
            content: 'system prompt',
            toolSchemas: null,
          },
          fullUserMessage: {
            content: '<user_query>hello</user_query>',
            metadata: { context_type: 'initial' },
          },
          toolSchemas: [
            expect.objectContaining({
              type: 'function',
              function: expect.objectContaining({
                name: 'read_file',
              }),
            }),
          ],
        }),
      }),
    ]);
  });

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

  test('editAndResend ignores caller replay payload, model, and turn ref in CJS runtime', async () => {
    const sentQueries = [];
    const updateSettings = jest.fn(async () => 'settings-edit');
    const store = new InMemoryConversationStore();
    await store.replaceDisplayTimeline({
      conversationRef: 'conv-sdk-cjs-runtime',
      revisionId: 'rev-display',
      createdAt: '2026-06-27T12:00:00.000Z',
      reason: null,
      baseRevisionId: null,
      rows: [{
        id: 'display-user-edit',
        conversationRef: 'conv-sdk-cjs-runtime',
        revisionId: 'rev-display',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'old text',
        metadata: {
          attachments: [{
            id: 'display-attachment-one',
            kind: 'image',
            source: 'user_included',
            status: 'ready',
            screenshotRef: 'artifact-one',
            filename: 'one.png',
          }],
        },
      }, {
        id: 'display-assistant-stale',
        conversationRef: 'conv-sdk-cjs-runtime',
        revisionId: 'rev-display',
        index: 1,
        role: 'assistant',
        type: 'assistant_message',
        content: 'stale answer',
      }],
    });
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-cjs-runtime',
      store,
      transport: createMockAgentRuntimeTransport({
        sendQuery: jest.fn(async payload => {
          sentQueries.push(payload);
          return 'query-edited';
        }),
        updateSettings,
      }),
    });

    await runtime.load();
    const result = await runtime.editAndResend({
      messageId: 'display-user-edit',
      text: 'new text',
      payload: { screenshot_refs: ['stale-caller-artifact'] },
      model: {
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
      turnRef: 'caller-owned-turn',
    });

    expect(updateSettings).not.toHaveBeenCalled();
    expect(sentQueries).toHaveLength(1);
    expect(sentQueries[0]).toEqual(expect.objectContaining({
      text: 'new text',
      screenshot_refs: ['artifact-one'],
      attachment_filenames: ['one.png'],
    }));
    expect(sentQueries[0]).not.toEqual(expect.objectContaining({
      screenshot_refs: ['stale-caller-artifact'],
    }));
    expect(result.turnRef).not.toBe('caller-owned-turn');
    const displayTimeline = await runtime.loadDisplayTimeline();
    expect(displayTimeline.rows[0]).toEqual(expect.objectContaining({
      id: `${result.turnRef}-sdk-evt-000002-user_message`,
      turnRef: result.turnRef,
    }));
  });

  test('retryTurn requires an explicit target row in CJS runtime', async () => {
    const store = new InMemoryConversationStore();
    await store.appendEvents([
      createConversationEvent({
        type: 'user_message',
        conversationRef: 'conv-sdk-cjs-runtime',
        revisionId: 'rev-old',
        eventId: 'user-retry',
        payload: { text: 'try again' },
      }),
      createConversationEvent({
        type: 'assistant_message',
        conversationRef: 'conv-sdk-cjs-runtime',
        revisionId: 'rev-old',
        eventId: 'assistant-retry',
        payload: { text: 'stale answer' },
      }),
    ]);
    const runtime = new SdkConversationRuntime({
      conversationRef: 'conv-sdk-cjs-runtime',
      store,
      transport: createMockAgentRuntimeTransport(),
    });

    await runtime.load();
    await expect(runtime.retryTurn()).rejects.toThrow('retryTurn requires a target message id');
  });
});
