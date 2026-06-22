/**
 * Covers Agent conversation store API behavior in the frontend test suite.
 */

import {
  Agent,
  LocalRuntimeConversationStore,
  createConversationEvent,
  type ConversationEvent,
  type CompactedReplaySnapshot,
} from '../../packages/windie-sdk-js/src';

function createAgentWithStore(store: Record<string, jest.Mock>) {
  return new Agent(
    'agent-test',
    {
      waitForOpen: jest.fn(),
      isOpen: jest.fn(() => true),
      close: jest.fn(),
      on: jest.fn(() => () => {}),
    } as never,
    {},
    {} as never,
    { listAgents: jest.fn(() => []) } as never,
    undefined,
    'user-1',
    store as never,
  );
}

describe('Agent public conversation store APIs', () => {
  test('routes revision reads and writes through the configured conversation store', async () => {
    const event = createConversationEvent({
      eventId: 'evt-1',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      payload: { text: 'hello' },
    });
    const snapshot: CompactedReplaySnapshot = {
      generationId: 'gen-1',
      conversationRef: 'conv-1',
      sourceRevisionId: 'rev-1',
      sourceTurnRef: null,
      createdAt: '2026-06-05T12:00:00.000Z',
      entries: [{ role: 'assistant', content: 'summary' }],
      entryCount: 1,
      complete: true,
      active: true,
    };
    const store = {
      getRevision: jest.fn(async () => ({
        conversationRef: 'conv-1',
        revisionId: 'rev-1',
        updatedAt: '2026-06-05T12:00:00.000Z',
      })),
      appendEvent: jest.fn(async () => undefined),
      replaceCompactedReplay: jest.fn(async () => undefined),
    };
    const agent = createAgentWithStore(store);

    await expect(agent.getConversationRevision('conv-1')).resolves.toEqual({
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      updatedAt: '2026-06-05T12:00:00.000Z',
    });
    await agent.appendConversationEvent(event);
    await agent.replaceCompactedReplay(snapshot);

    expect(store.getRevision).toHaveBeenCalledWith('conv-1');
    expect(store.appendEvent).toHaveBeenCalledWith(event);
    expect(store.replaceCompactedReplay).toHaveBeenCalledWith(snapshot);
    expect((agent as unknown as Record<string, unknown>).rewriteConversation).toBeUndefined();
  });

  test('accepts explicit store overrides for conversation mutations', async () => {
    const defaultStore = {
      appendEvent: jest.fn(),
      replaceCompactedReplay: jest.fn(),
      getRevision: jest.fn(),
    };
    const overrideStore = {
      appendEvent: jest.fn(async () => undefined),
      replaceCompactedReplay: jest.fn(async () => undefined),
      getRevision: jest.fn(async () => ({
        conversationRef: 'conv-override',
        revisionId: 'rev-override',
        updatedAt: '2026-06-05T12:00:00.000Z',
      })),
    };
    const agent = createAgentWithStore(defaultStore);
    const event = createConversationEvent({
      eventId: 'evt-override',
      type: 'user_message',
      conversationRef: 'conv-override',
      revisionId: 'rev-override',
      payload: { text: 'override' },
    });

    await agent.appendConversationEvent({ event, store: overrideStore as never });
    await expect(agent.getConversationRevision({
      conversationRef: 'conv-override',
      store: overrideStore as never,
    })).resolves.toMatchObject({ revisionId: 'rev-override' });

    expect(defaultStore.appendEvent).not.toHaveBeenCalled();
    expect(defaultStore.getRevision).not.toHaveBeenCalled();
    expect(overrideStore.appendEvent).toHaveBeenCalledWith(event);
    expect(overrideStore.getRevision).toHaveBeenCalledWith('conv-override');
  });

  test('emits app diagnostics around public conversation listing', async () => {
    const diagnostics: unknown[] = [];
    const store = {
      listMetadata: jest.fn(async () => [
        {
          conversationRef: 'conv-1',
          revisionId: 'rev-1',
          title: 'Stored title',
          updatedAt: '2026-06-05T12:00:00.000Z',
          eventCount: 2,
        },
      ]),
    };
    const agent = createAgentWithStore(store);

    await expect(agent.listConversations({
      limit: 5,
      diagnostics: {
        emit: async event => {
          diagnostics.push(event);
        },
      },
    })).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-1',
      }),
    ]);

    expect(store.listMetadata).toHaveBeenCalledWith(expect.objectContaining({
      limit: 5,
      diagnostics: expect.objectContaining({
        emit: expect.any(Function),
      }),
    }));
    expect(diagnostics).toEqual([
      expect.objectContaining({
        stage: 'sdk_list',
        status: 'started',
        runtime: 'sdk',
        data: { limit: 5 },
      }),
      expect.objectContaining({
        stage: 'sdk_list',
        status: 'succeeded',
        runtime: 'sdk',
        data: {
          limit: 5,
          resultCount: 1,
        },
      }),
    ]);
  });
});

describe('LocalRuntimeConversationStore event payload write params', () => {
  test('merges query screenshot metadata from raw local-runtime events into display rows', async () => {
    const userEvent: ConversationEvent = createConversationEvent({
      eventId: 'evt-user',
      type: 'user_message',
      conversationRef: 'conv-shot',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'ui',
      timestamp: '2026-06-21T12:00:00.000Z',
      payload: {
        text: 'hey',
      },
    });
    const metadataEvent: ConversationEvent = createConversationEvent({
      eventId: 'evt-user-metadata',
      type: 'user_message_metadata',
      conversationRef: 'conv-shot',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'sdk',
      timestamp: '2026-06-21T12:00:01.000Z',
      payload: {
        text: 'hey',
        screenshotRef: 'artifact-shot-1.jpg',
        screenshot_ref: 'artifact-shot-1.jpg',
        screenshotUrl: '/api/artifacts/artifact-shot-1.jpg',
        screenshot_url: '/api/artifacts/artifact-shot-1.jpg',
        screenshotRefs: ['artifact-shot-1.jpg'],
        screenshot_refs: ['artifact-shot-1.jpg'],
      },
    });
    const assistantEvent: ConversationEvent = createConversationEvent({
      eventId: 'evt-assistant',
      type: 'assistant_message',
      conversationRef: 'conv-shot',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      timestamp: '2026-06-21T12:00:02.000Z',
      payload: {
        text: 'hi',
      },
    });
    const rpc = jest.fn(async ({ method }) => {
      if (method === 'conversation.load_events') {
        return {
          success: true,
          data: {
            events: [
              {
                message_index: 1,
                metadata: {},
                event_payload: userEvent,
              },
              {
                message_index: 2,
                metadata: {
                  screenshot: 'legacy-inline-only.jpg',
                },
                event_payload: metadataEvent,
              },
              {
                message_index: 3,
                metadata: {},
                event_payload: assistantEvent,
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    });
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });

    const rows = await store.loadDisplayRows('conv-shot');

    expect(rows.map(row => row.type)).toEqual([
      'user_message',
      'assistant_message',
    ]);
    expect(rows[0]).toMatchObject({
      id: 'evt-user',
      type: 'user_message',
      content: 'hey',
      metadata: expect.objectContaining({
        eventId: 'evt-user-metadata',
        screenshotRef: 'artifact-shot-1.jpg',
        screenshot_ref: 'artifact-shot-1.jpg',
        screenshotUrl: '/api/artifacts/artifact-shot-1.jpg',
        screenshot_url: '/api/artifacts/artifact-shot-1.jpg',
        screenshotRefs: ['artifact-shot-1.jpg'],
        screenshot_refs: ['artifact-shot-1.jpg'],
      }),
    });
    expect(rows[0]?.metadata?.screenshot).toBeNull();
    expect(rows[0]?.metadata?.raw).toEqual(expect.objectContaining({
      screenshot_refs: ['artifact-shot-1.jpg'],
    }));
  });

  test('loads generic metadata event payloads and ignores removed product metadata keys', async () => {
    const genericEvent: ConversationEvent = createConversationEvent({
      eventId: 'evt-generic',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      payload: { text: 'generic metadata' },
    });
    const ignoredSnakeLegacyEvent: ConversationEvent = createConversationEvent({
      eventId: 'evt-legacy',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      payload: { text: 'legacy metadata' },
    });
    const ignoredLegacyEvent: ConversationEvent = createConversationEvent({
      eventId: 'evt-ignored-legacy',
      type: 'assistant_message',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      payload: { text: 'ignored legacy metadata' },
    });
    const rpc = jest.fn(async ({ method }) => {
      if (method === 'conversation.load_events') {
        return {
          success: true,
          data: {
            events: [
              {
                metadata: {
                  agent_sdk_conversation_event: genericEvent,
                  windie_sdk_conversation_event: ignoredSnakeLegacyEvent,
                },
              },
              {
                metadata: JSON.stringify({
                  windieSdkConversationEvent: ignoredLegacyEvent,
                }),
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    });
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });

    await expect(store.loadEvents('conv-1')).resolves.toEqual([
      genericEvent,
    ]);
  });

  test('normalizes local-runtime metadata event counts before exposing conversation rows', async () => {
    const rpc = jest.fn(async ({ method }) => {
      if (method === 'conversation.list') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-valid',
                revision_id: 'rev-1',
                title: 'Valid count',
                last_timestamp: '2026-06-05T12:00:00.000Z',
                entry_count: '3',
              },
              {
                conversation_id: 'conv-negative',
                revision_id: 'rev-2',
                title: 'Negative count',
                last_timestamp: '2026-06-05T12:01:00.000Z',
                entry_count: -2,
              },
              {
                conversationId: 'conv-camel-removed',
                revisionId: 'rev-camel',
                title: 'Removed alias row',
                updatedAt: '2026-06-05T12:03:00.000Z',
                eventCount: 9,
              },
            ],
          },
        };
      }
      if (method === 'conversation.search') {
        return {
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv-fractional',
                revision_id: 'rev-3',
                title: 'Fractional count',
                last_timestamp: '2026-06-05T12:02:00.000Z',
                eventCount: 1.5,
              },
            ],
          },
        };
      }
      return { success: true, data: {} };
    });
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });

    await expect(store.listMetadata()).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-negative',
        eventCount: 0,
      }),
      expect.objectContaining({
        conversationRef: 'conv-valid',
        eventCount: 3,
      }),
    ]);
    await expect(store.searchMetadata({ query: 'count' })).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-fractional',
        eventCount: 0,
      }),
    ]);
  });

  test('passes diagnostics context to local-runtime list and emits local-runtime events', async () => {
    const diagnostics: unknown[] = [];
    const rpc = jest.fn(async () => ({
      success: true,
      data: {
        diagnostics: {
          events: [
            {
              stage: 'history_db_checked',
              status: 'succeeded',
              data: {
                canonicalHistoryDbExists: true,
              },
            },
          ],
        },
        conversations: [
          {
            conversation_id: 'conv-1',
            revision_id: 'rev-1',
            title: 'Valid count',
            last_timestamp: '2026-06-05T12:00:00.000Z',
            entry_count: 1,
          },
        ],
      },
    }));
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });

    await expect(store.listMetadata({
      limit: 7,
      diagnostics: {
        path: 'conversation.metadata.list',
        traceId: 'diag-1',
        requestId: 'req-1',
        emit: async event => {
          diagnostics.push(event);
        },
      },
    })).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-1',
      }),
    ]);

    expect(rpc).toHaveBeenCalledWith({
      method: 'conversation.list',
      params: expect.objectContaining({
        user_id: 'user-1',
        limit: 7,
        diagnostics: {
          path: 'conversation.metadata.list',
          trace_id: 'diag-1',
          parent_span_id: undefined,
          request_id: 'req-1',
          session_id: undefined,
          conversation_ref: undefined,
        },
      }),
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        stage: 'local_runtime_rpc',
        status: 'started',
        runtime: 'sdk',
      }),
      expect.objectContaining({
        stage: 'history_db_checked',
        status: 'succeeded',
        runtime: 'local-runtime',
        data: {
          canonicalHistoryDbExists: true,
        },
      }),
      expect.objectContaining({
        stage: 'local_runtime_rpc',
        status: 'succeeded',
        runtime: 'sdk',
        data: expect.objectContaining({
          limit: 7,
          resultCount: 1,
        }),
      }),
    ]);
  });

  test('extracts UI-supplied event payload metadata before calling local runtime RPC', async () => {
    const rpc = jest.fn(async () => ({ success: true, data: { message_index: 1 } }));
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });
    const event: ConversationEvent = createConversationEvent({
      eventId: 'evt-tool',
      type: 'tool_output',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      payload: {
        text: 'clicked',
        toolName: 'mouse_control',
        toolCallId: 'call-1',
        workspacePath: '/repo',
        workspaceName: 'Project Alpha',
        modelId: 'model-1',
        modelProvider: 'provider-1',
        screenshotRef: 'artifact-1',
        attachments: [{
          kind: 'image',
          ref: 'artifact-1',
        }],
      },
    });

    await store.appendEvent(event);

    expect(rpc).toHaveBeenCalledWith({
      method: 'conversation.append_event',
      params: expect.objectContaining({
        user_id: 'user-1',
        conversation_id: 'conv-1',
        event_type: 'tool_output',
        tool_name: 'mouse_control',
        correlation_id: 'call-1',
        workspace_path: '/repo',
        workspace_name: 'Project Alpha',
        attachments: [
          expect.objectContaining({
            kind: 'image',
            ref: 'artifact-1',
          }),
        ],
        metadata: expect.objectContaining({
          model_id: 'model-1',
          model_provider: 'provider-1',
          screenshot: 'artifact-1',
        }),
        event_payload: event,
      }),
    });
  });

  test('logs successful compaction event storage after local runtime RPC succeeds', async () => {
    const rpc = jest.fn(async () => ({ success: true, data: { message_index: 7 } }));
    const previousDebugCompactionStdout = process.env.AGENT_DEBUG_COMPACTION_STDOUT;
    process.env.AGENT_DEBUG_COMPACTION_STDOUT = '1';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const store = new LocalRuntimeConversationStore({
      userId: 'user-1',
      runtime: { rpc },
    });
    const event: ConversationEvent = createConversationEvent({
      eventId: 'evt-compaction',
      type: 'compaction_applied',
      conversationRef: 'conv-1',
      revisionId: 'rev-1',
      turnRef: 'turn-1',
      source: 'backend',
      payload: {
        generationId: 'gen-1',
        skippedReason: null,
        summaryText: 'full summary should remain out of the log',
      },
    });

    await store.appendEvent(event);

    expect(logSpy).toHaveBeenCalledWith(
      '[Agent SDK][Compaction] conversation.append_event succeeded',
      expect.objectContaining({
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        revisionId: 'rev-1',
        eventId: 'evt-compaction',
        eventType: 'compaction_applied',
        source: 'backend',
        userId: 'user-1',
        messageIndex: 7,
        generationId: 'gen-1',
        hasCompactionCheckpoint: true,
      }),
    );
    expect(logSpy.mock.calls[0][1]).not.toHaveProperty('summaryText');
    logSpy.mockRestore();
    if (previousDebugCompactionStdout === undefined) {
      delete process.env.AGENT_DEBUG_COMPACTION_STDOUT;
    } else {
      process.env.AGENT_DEBUG_COMPACTION_STDOUT = previousDebugCompactionStdout;
    }
  });
});
