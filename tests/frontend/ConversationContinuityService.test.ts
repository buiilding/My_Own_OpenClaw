import { ConversationContinuityService } from '../../packages/windie-sdk-js/src/runtime/ConversationContinuityService';
import type {
  ConversationStore,
  JsonRecord,
  RehydratePayload,
} from '../../packages/windie-sdk-js/src';

function createStore(overrides: Partial<ConversationStore> = {}) {
  return {
    appendEvent: jest.fn(),
    appendEvents: jest.fn(),
    rewriteConversation: jest.fn(),
    replaceCompactedReplay: jest.fn(),
    loadEvents: jest.fn(),
    loadForDisplay: jest.fn(),
    loadForRehydrate: jest.fn(),
    listMetadata: jest.fn(),
    getRevision: jest.fn(),
    ...overrides,
  } as jest.Mocked<ConversationStore> & {
    deleteConversation?: jest.Mock;
  };
}

describe('ConversationContinuityService', () => {
  test('rehydrateFromStore builds provider-safe backend payload from store projection', async () => {
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
      hydrated: true,
      messageCount: 2,
      revisionId: 'rev-1',
    });

    expect(rehydrateConversation).toHaveBeenCalledWith({
      conversation_ref: 'conv-1',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '{"text":"structured"}' },
      ],
      rehydrate_mode: 'replace',
      workspace_path: '/repo',
    });
  });

  test('rehydrateFromStore skips backend transport when projection has no provider messages', async () => {
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
    expect(store.rewriteConversation).not.toHaveBeenCalled();
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

    expect(store.rewriteConversation).not.toHaveBeenCalled();
  });
});
