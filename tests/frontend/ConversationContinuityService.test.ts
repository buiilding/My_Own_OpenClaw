/**
 * Covers conversation continuity service. behavior in the frontend test suite.
 */

import {
  ConversationContinuityService,
  conversationMetadataInvalidationFromLocalRuntimeEvent,
} from '../../packages/windie-sdk-js/src/runtime/ConversationContinuityService';
import type {
  ConversationStore,
  JsonRecord,
  RehydratePayload,
} from '../../packages/windie-sdk-js/src';
import { InMemoryConversationStore } from '../../packages/windie-sdk-js/src/stores/InMemoryConversationStore';

function createStore(overrides: Partial<ConversationStore> = {}) {
  return {
    appendEvent: jest.fn(),
    appendEvents: jest.fn(),
    replaceCompactedReplay: jest.fn(),
    loadEvents: jest.fn(),
    loadForDisplay: jest.fn(),
    loadDisplayRows: jest.fn(),
    loadForRehydrate: jest.fn(),
    listMetadata: jest.fn(),
    getRevision: jest.fn(),
    ...overrides,
  } as jest.Mocked<ConversationStore> & {
    deleteConversation?: jest.Mock;
  };
}

describe('ConversationContinuityService', () => {
  test('normalizes local runtime title updates into public metadata invalidations', () => {
    expect(conversationMetadataInvalidationFromLocalRuntimeEvent({
      type: 'conversation-title-updated',
      payload: {
        conversation_id: 'conv-title',
        title: 'Generated title',
        source: 'model',
      },
    })).toEqual(expect.objectContaining({
      type: 'conversation-metadata-invalidated',
      reason: 'conversation-title-updated',
      conversationRef: 'conv-title',
      title: 'Generated title',
      source: 'model',
    }));

    expect(conversationMetadataInvalidationFromLocalRuntimeEvent({
      type: 'tool-output',
    })).toBeNull();
  });

  test('ignores removed local runtime title update aliases', () => {
    expect(conversationMetadataInvalidationFromLocalRuntimeEvent({
      type: 'conversation-title-updated',
      conversation_id: 'conv-top-level',
      title: 'Top level title',
      payload: {
        conversationId: 'conv-camel',
        conversation_ref: 'conv-ref',
        conversationRef: 'conv-ref-camel',
        titleSource: 'model',
        title_source: 'heuristic',
      },
    })).toEqual(expect.objectContaining({
      conversationRef: null,
      title: null,
      source: null,
    }));
  });

  test('searchMetadata delegates to store adapter search when available', async () => {
    const store = {
      ...createStore(),
      searchMetadata: jest.fn().mockResolvedValue([
        {
          conversationRef: 'conv-match',
          revisionId: 'rev-1',
          title: 'Match',
          lastMessage: 'hello',
          updatedAt: '2026-05-22T00:00:00.000Z',
          eventCount: 2,
        },
      ]),
    };
    const service = new ConversationContinuityService({
      storeFactory: () => store,
    });

    await expect(service.searchMetadata({
      userId: 'user-1',
    }, {
      query: 'match',
      limit: 5,
    })).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-match',
      }),
    ]);

    expect(store.searchMetadata).toHaveBeenCalledWith({
      query: 'match',
      limit: 5,
    });
    expect(store.listMetadata).not.toHaveBeenCalled();
  });

  test('loadDisplayRows delegates to the SDK store row projection', async () => {
    const store = createStore({
      loadDisplayRows: jest.fn().mockResolvedValue([
        {
          id: 'row-user',
          conversationRef: 'conv-display',
          index: 0,
          role: 'user',
          type: 'user_message',
          content: 'hello',
        },
      ]),
    });
    const service = new ConversationContinuityService({
      storeFactory: () => store,
    });

    await expect(service.loadDisplayRows({
      userId: 'user-1',
      conversationRef: 'conv-display',
    })).resolves.toEqual([
      expect.objectContaining({
        id: 'row-user',
        type: 'user_message',
      }),
    ]);
    expect(store.loadDisplayRows).toHaveBeenCalledWith('conv-display');
  });

  test('searchMetadata filters listMetadata when store adapter has no native search', async () => {
    const store = createStore({
      listMetadata: jest.fn().mockResolvedValue([
        {
          conversationRef: 'conv-alpha',
          revisionId: 'rev-1',
          title: 'Alpha plan',
          lastMessage: 'first',
          updatedAt: '2026-05-22T00:00:00.000Z',
          eventCount: 2,
        },
        {
          conversationRef: 'conv-beta',
          revisionId: 'rev-2',
          title: 'Beta',
          lastMessage: 'needle in last message',
          updatedAt: '2026-05-21T00:00:00.000Z',
          eventCount: 2,
        },
      ]),
    });
    const service = new ConversationContinuityService({
      storeFactory: () => store,
    });

    await expect(service.searchMetadata({
      userId: 'user-1',
    }, {
      query: 'needle',
    })).resolves.toEqual([
      expect.objectContaining({
        conversationRef: 'conv-beta',
      }),
    ]);
  });

  test('rehydrateFromStore skips event-projection hydration without model history', async () => {
    const store = createStore({
      loadForRehydrate: jest.fn().mockResolvedValue({
        conversationRef: 'conv-1',
        revisionId: 'rev-1',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: { text: 'structured' } },
          { role: 'system', content: 'debug' },
        ],
      }),
    });
    const rehydrateConversation = jest.fn<Promise<void>, [RehydratePayload]>().mockResolvedValue(undefined);
    const service = new ConversationContinuityService({
      storeFactory: () => store,
      transportFactory: () => ({ rehydrateConversation }),
    });

    await expect(service.rehydrateFromStore({
      userId: 'user-1',
      conversationRef: 'conv-1',
      workspacePath: '/repo',
    })).resolves.toMatchObject({
      hydrated: false,
      messageCount: 0,
      revisionId: 'rev-empty',
      source: 'missing_model_history',
    });

    expect(store.loadForRehydrate).not.toHaveBeenCalled();
    expect(rehydrateConversation).not.toHaveBeenCalled();
  });

  test('rehydrateFromStore installs persisted model history when available', async () => {
    const store = createStore({
      getRevision: jest.fn().mockResolvedValue({
        conversationRef: 'conv-1',
        revisionId: 'rev-model-history',
        updatedAt: '2026-06-22T12:00:00.000Z',
      }),
      loadModelHistory: jest.fn().mockResolvedValue({
        checkpointId: 'mh-rev-model-history-turn-1',
        conversationRef: 'conv-1',
        revisionId: 'rev-model-history',
        createdAt: '2026-06-22T12:00:00.000Z',
        rows: [
          {
            id: 'mh-row-tool',
            conversationRef: 'conv-1',
            revisionId: 'rev-model-history',
            role: 'tool',
            messageType: 'tool_output',
            content: 'bounded output',
            toolCallId: 'call-1',
            toolName: 'read_file',
            imageRefs: ['artifact-1'],
            sourceDisplayRowIds: ['display-tool'],
          },
        ],
      }),
      loadForRehydrate: jest.fn().mockResolvedValue({
        conversationRef: 'conv-1',
        revisionId: 'rev-model-history',
        messages: [
          { role: 'tool', content: 'full display output' },
        ],
      }),
    });
    const rehydrateConversation = jest.fn();
    const service = new ConversationContinuityService({
      storeFactory: () => store,
      transportFactory: () => ({ rehydrateConversation }),
    });

    await expect(service.rehydrateFromStore({
      userId: 'user-1',
      conversationRef: 'conv-1',
    })).resolves.toMatchObject({
      hydrated: true,
      messageCount: 1,
      revisionId: 'rev-model-history',
      modelHistoryCheckpointId: 'mh-rev-model-history-turn-1',
      source: 'model_history',
    });

    expect(store.loadForRehydrate).not.toHaveBeenCalled();
    expect(rehydrateConversation).toHaveBeenCalledWith({
      conversation_ref: 'conv-1',
      messages: [],
      model_history: expect.objectContaining({
        checkpoint_id: 'mh-rev-model-history-turn-1',
        rows: [
          expect.objectContaining({
            content: 'bounded output',
            tool_call_id: 'call-1',
          }),
        ],
      }),
      rehydrate_mode: 'replace',
      workspace_path: null,
    });
  });

  test('rehydrateFromStore requires transport when model history exists', async () => {
    const store = createStore({
      getRevision: jest.fn().mockResolvedValue({
        conversationRef: 'conv-1',
        revisionId: 'rev-model-history',
        updatedAt: '2026-06-22T12:00:00.000Z',
      }),
      loadModelHistory: jest.fn().mockResolvedValue({
        checkpointId: 'mh-rev-model-history-turn-1',
        conversationRef: 'conv-1',
        revisionId: 'rev-model-history',
        createdAt: '2026-06-22T12:00:00.000Z',
        rows: [
          {
            id: 'mh-row-user',
            conversationRef: 'conv-1',
            revisionId: 'rev-model-history',
            role: 'user',
            messageType: 'user_query',
            content: 'hello',
          },
        ],
      }),
    });
    const service = new ConversationContinuityService({
      storeFactory: () => store,
    });

    await expect(service.rehydrateFromStore({
      userId: 'user-1',
      conversationRef: 'conv-1',
    })).rejects.toThrow('Conversation continuity rehydrate requires an agent runtime transport');
  });

  test('rehydrateFromStore binds model history loaders on real store adapters', async () => {
    const store = new InMemoryConversationStore();
    await store.replaceModelHistory({
      checkpointId: 'mh-latest',
      conversationRef: 'conv-real-store',
      revisionId: 'rev-real-store',
      createdAt: '2026-06-22T12:00:00.000Z',
      rows: [
        {
          id: 'mh-row-user',
          conversationRef: 'conv-real-store',
          revisionId: 'rev-real-store',
          role: 'user',
          messageType: 'user_query',
          content: 'bounded user query',
        },
      ],
    });
    const loadForRehydrate = jest.spyOn(store, 'loadForRehydrate');
    const rehydrateConversation = jest.fn<Promise<void>, [RehydratePayload]>().mockResolvedValue(undefined);
    const service = new ConversationContinuityService({
      storeFactory: () => store,
      transportFactory: () => ({ rehydrateConversation }),
    });

    await expect(service.rehydrateFromStore({
      userId: 'user-1',
      conversationRef: 'conv-real-store',
    })).resolves.toMatchObject({
      hydrated: true,
      source: 'model_history',
      modelHistoryCheckpointId: 'mh-latest',
    });

    expect(loadForRehydrate).not.toHaveBeenCalled();
    expect(rehydrateConversation).toHaveBeenCalledWith(expect.objectContaining({
      conversation_ref: 'conv-real-store',
      messages: [],
      model_history: expect.objectContaining({
        checkpoint_id: 'mh-latest',
      }),
    }));
  });

  test('rehydrateFromStore skips transport when model history is missing even if projection has rows', async () => {
    const store = createStore({
      loadForRehydrate: jest.fn().mockResolvedValue({
        conversationRef: 'conv-empty',
        revisionId: 'rev-1',
        messages: [
          { role: 'system', content: 'debug' },
        ] as JsonRecord[],
      }),
    });
    const rehydrateConversation = jest.fn();
    const service = new ConversationContinuityService({
      storeFactory: () => store,
      transportFactory: () => ({ rehydrateConversation }),
    });

    await expect(service.rehydrateFromStore({
      userId: 'user-1',
      conversationRef: 'conv-empty',
    })).resolves.toMatchObject({
      hydrated: false,
      messageCount: 0,
    });

    expect(rehydrateConversation).not.toHaveBeenCalled();
  });

  test('rehydrateFromStore does not require transport when model history is missing', async () => {
    const store = createStore({
      loadForRehydrate: jest.fn().mockResolvedValue({
        conversationRef: 'conv-provider',
        revisionId: 'rev-1',
        messages: [
          { role: 'user', content: 'hello' },
        ] as JsonRecord[],
      }),
    });
    const service = new ConversationContinuityService({
      storeFactory: () => store,
    });

    await expect(service.rehydrateFromStore({
      userId: 'user-1',
      conversationRef: 'conv-provider',
    })).resolves.toMatchObject({
      hydrated: false,
      messageCount: 0,
      source: 'missing_model_history',
    });
    expect(store.loadForRehydrate).not.toHaveBeenCalled();
  });

  test('deleteConversation delegates to store adapter deletion when available', async () => {
    const store = {
      ...createStore(),
      deleteConversation: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ConversationContinuityService({
      storeFactory: () => store,
    });

    await service.deleteConversation({
      userId: 'user-1',
      conversationRef: 'conv-delete',
    });

    expect(store.deleteConversation).toHaveBeenCalledWith('conv-delete');
  });

  test('deleteConversation fails clearly when store adapter cannot delete', async () => {
    const store = createStore();
    const service = new ConversationContinuityService({
      storeFactory: () => store,
    });

    await expect(service.deleteConversation({
      userId: 'user-1',
      conversationRef: 'conv-delete',
    })).rejects.toThrow('deletable conversation store');
  });

  test('subscribeMetadataInvalidations maps local runtime title updates', () => {
    const unsubscribe = jest.fn();
    let localRuntimeListener: ((event: JsonRecord & { type?: unknown }) => void) | null = null;
    const onInvalidation = jest.fn();
    const service = new ConversationContinuityService({
      storeFactory: () => createStore(),
      localRuntimeEventSource: {
        subscribeEvents: (listener) => {
          localRuntimeListener = listener;
          return unsubscribe;
        },
      },
    });

    const cleanup = service.subscribeMetadataInvalidations(onInvalidation);

    localRuntimeListener?.({
      type: 'conversation-title-updated',
      payload: {
        conversation_id: 'conv-title',
        title: 'Generated title',
        source: 'model',
      },
    });
    localRuntimeListener?.({
      type: 'tool-output',
    });

    expect(onInvalidation).toHaveBeenCalledTimes(1);
    expect(onInvalidation).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversation-metadata-invalidated',
      reason: 'conversation-title-updated',
      conversationRef: 'conv-title',
      title: 'Generated title',
      source: 'model',
      sourceEvent: expect.objectContaining({
        type: 'conversation-title-updated',
      }),
    }));
    expect(onInvalidation.mock.calls[0][0]).not.toHaveProperty('rawEvent');
    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
