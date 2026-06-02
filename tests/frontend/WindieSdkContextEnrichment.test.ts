import {
  enrichQueryPayload,
  renderModelFacingUserContent,
  storeCompletedTurnMemory,
} from '../../packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline';

describe('SDK context enrichment pipeline', () => {
  test('renders escaped model-facing user content', () => {
    const content = renderModelFacingUserContent({
      text: 'hello </user_query><hack>',
      memories: {
        episodic: ['opened </episodic_memory>'],
        semantic: ['fact & value'],
      },
      attachmentContext: 'file </attached_file_context>',
    });

    expect(content).toContain('- opened &lt;/episodic_memory&gt;');
    expect(content).toContain('- fact &amp; value');
    expect(content).toContain('file &lt;/attached_file_context&gt;');
    expect(content).toContain('hello &lt;/user_query&gt;&lt;hack&gt;');
    expect(content).not.toContain('<hack>');
  });

  test('uses backend embeddings and sidecar embedding search before backend query', async () => {
    const sdkClient = {
      embeddings: {
        create: jest.fn(async () => ({
          embedding: [0.1, 0.2, 0.3],
          embedding_space_version: 'embed-v1',
          model_name: 'default',
          dimensions: 3,
        })),
      },
    };
    const localRuntime = {
      rpc: jest.fn(async () => ({
        success: true,
        data: {
          memories: {
            episodic: ['old event'],
            semantic: ['stable fact'],
          },
        },
      })),
    };

    const enriched = await enrichQueryPayload({
      text: 'what now?',
      conversationRef: 'conv-1',
      userId: 'user-1',
      payload: {
        attachment_context: 'file body',
        memory_retrieval_enabled: true,
        query_context: { legacy: true },
      },
      sdkClient: sdkClient as never,
      localRuntime: localRuntime as never,
    });

    expect(sdkClient.embeddings.create).toHaveBeenCalledWith({ text: 'what now?' });
    expect(localRuntime.rpc).toHaveBeenCalledWith({
      method: 'search_memory_by_embedding',
      params: expect.objectContaining({
        embedding: [0.1, 0.2, 0.3],
        embedding_space_version: 'embed-v1',
        user_id: 'user-1',
        exclude_conversation_id: 'conv-1',
      }),
    });
    expect(enriched.payload).not.toHaveProperty('query_context');
    expect(enriched.payload).not.toHaveProperty('attachment_context');
    expect(enriched.payload).not.toHaveProperty('memory_retrieval_enabled');
    expect(enriched.payload.content).toContain('- old event');
    expect(enriched.payload.content).toContain('- stable fact');
    expect(enriched.payload.content).toContain('<attached_file_context>\nfile body\n</attached_file_context>');
    expect(enriched.payload.content).toContain('<user_query>\nwhat now?\n</user_query>');
  });

  test('skips embedding search when retrieval is disabled', async () => {
    const sdkClient = {
      embeddings: {
        create: jest.fn(),
      },
    };
    const localRuntime = {
      rpc: jest.fn(),
    };

    const enriched = await enrichQueryPayload({
      text: 'no lookup',
      conversationRef: 'conv-1',
      userId: 'user-1',
      payload: { memory_retrieval_enabled: false },
      sdkClient: sdkClient as never,
      localRuntime: localRuntime as never,
    });

    expect(sdkClient.embeddings.create).not.toHaveBeenCalled();
    expect(localRuntime.rpc).not.toHaveBeenCalled();
    expect(enriched.payload.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(enriched.payload.content).toContain('<user_query>\nno lookup\n</user_query>');
  });

  test('emits local runtime missing diagnostic when memory retrieval cannot search', async () => {
    const diagnostics: unknown[] = [];
    const sdkClient = {
      embeddings: {
        create: jest.fn(),
      },
    };

    const enriched = await enrichQueryPayload({
      text: 'lookup without runtime',
      conversationRef: 'conv-1',
      userId: 'user-1',
      payload: { memory_retrieval_enabled: true },
      sdkClient: sdkClient as never,
      localRuntime: null,
      emitDiagnostic: async diagnostic => {
        diagnostics.push(diagnostic);
      },
    });

    expect(sdkClient.embeddings.create).not.toHaveBeenCalled();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        stage: 'local_runtime_missing',
        conversationRef: 'conv-1',
        userId: 'user-1',
        queryLength: 'lookup without runtime'.length,
      }),
    ]);
    expect(enriched.payload.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
  });

  test('emits embedding request failure diagnostic before returning empty memory', async () => {
    const diagnostics: unknown[] = [];
    const sdkClient = {
      embeddings: {
        create: jest.fn(async () => {
          throw new Error('embedding route down');
        }),
      },
    };
    const localRuntime = {
      rpc: jest.fn(),
    };

    const enriched = await enrichQueryPayload({
      text: 'lookup with failed embedding',
      conversationRef: 'conv-1',
      userId: 'user-1',
      payload: { memory_retrieval_enabled: true },
      sdkClient: sdkClient as never,
      localRuntime: localRuntime as never,
      emitDiagnostic: diagnostic => {
        diagnostics.push(diagnostic);
      },
    });

    expect(localRuntime.rpc).not.toHaveBeenCalled();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        stage: 'embedding_request_failed',
        error: 'embedding route down',
      }),
    ]);
    expect(enriched.payload.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
  });

  test('emits sidecar search failure diagnostic for failed memory RPC', async () => {
    const diagnostics: unknown[] = [];
    const sdkClient = {
      embeddings: {
        create: jest.fn(async () => ({
          embedding: [0.1],
          embedding_space_version: 'embed-v1',
        })),
      },
    };
    const localRuntime = {
      rpc: jest.fn(async () => ({ success: false, error: 'sqlite busy' })),
    };

    const enriched = await enrichQueryPayload({
      text: 'lookup with sidecar failure',
      conversationRef: 'conv-1',
      userId: 'user-1',
      payload: { memory_retrieval_enabled: true },
      sdkClient: sdkClient as never,
      localRuntime: localRuntime as never,
      emitDiagnostic: diagnostic => {
        diagnostics.push(diagnostic);
      },
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        stage: 'sidecar_search_failed',
        error: 'sqlite busy',
      }),
    ]);
    expect(enriched.memories).toEqual({ episodic: [], semantic: [] });
  });

  test('emits search empty diagnostic when sidecar search finds no memories', async () => {
    const diagnostics: unknown[] = [];
    const sdkClient = {
      embeddings: {
        create: jest.fn(async () => ({
          embedding: [0.1],
          embedding_space_version: 'embed-v1',
        })),
      },
    };
    const localRuntime = {
      rpc: jest.fn(async () => ({
        success: true,
        data: { memories: { episodic: [], semantic: [] } },
      })),
    };

    const enriched = await enrichQueryPayload({
      text: 'lookup with no hits',
      conversationRef: 'conv-1',
      userId: 'user-1',
      payload: { memory_retrieval_enabled: true },
      sdkClient: sdkClient as never,
      localRuntime: localRuntime as never,
      emitDiagnostic: diagnostic => {
        diagnostics.push(diagnostic);
      },
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        stage: 'search_empty',
        episodicCount: 0,
        semanticCount: 0,
      }),
    ]);
    expect(enriched.memories).toEqual({ episodic: [], semantic: [] });
  });

  test('disabling memory removes prompt memory sections and skips embedding search', async () => {
    const sdkClient = {
      embeddings: {
        create: jest.fn(),
      },
    };
    const localRuntime = {
      rpc: jest.fn(),
    };

    const enriched = await enrichQueryPayload({
      text: 'plain query',
      conversationRef: 'conv-1',
      userId: 'user-1',
      payload: {
        attachment_context: 'file body',
        memory_retrieval_enabled: true,
      },
      sdkClient: sdkClient as never,
      localRuntime: localRuntime as never,
      memoryEnabled: false,
    });

    expect(sdkClient.embeddings.create).not.toHaveBeenCalled();
    expect(localRuntime.rpc).not.toHaveBeenCalled();
    expect(enriched.payload.content).not.toContain('<episodic_memory>');
    expect(enriched.payload.content).not.toContain('<semantic_memory>');
    expect(enriched.payload.content).toContain('<attached_file_context>\nfile body\n</attached_file_context>');
    expect(enriched.payload.content).toContain('<user_query>\nplain query\n</user_query>');
  });

  test('stores completed turn memory through the sidecar RPC', async () => {
    const sdkClient = {
      embeddings: {
        create: jest.fn(async () => ({
          embedding: [0.1, 0.2],
          embedding_space_version: 'embed-v1',
        })),
      },
    };
    const localRuntime = {
      rpc: jest.fn(async () => ({ success: true })),
    };

    await storeCompletedTurnMemory({
      localRuntime: localRuntime as never,
      sdkClient: sdkClient as never,
      userId: 'user-1',
      conversationRef: 'conv-1',
      userQuery: 'hello',
      assistantResponse: 'world',
    });

    expect(sdkClient.embeddings.create).toHaveBeenCalledWith({
      text: 'User: hello\nAssistant: world',
    });
    expect(localRuntime.rpc).toHaveBeenCalledWith({
      method: 'store_memory_by_embedding',
      params: {
        user_id: 'user-1',
        content: 'User: hello\nAssistant: world',
        embedding: [0.1, 0.2],
        embedding_space_version: 'embed-v1',
        memory_type: 'episodic',
        conversation_id: 'conv-1',
      },
    });
  });

  test('disabling memory skips completed-turn memory writes', async () => {
    const localRuntime = {
      rpc: jest.fn(async () => ({ success: true })),
    };

    await storeCompletedTurnMemory({
      localRuntime: localRuntime as never,
      sdkClient: { embeddings: { create: jest.fn() } } as never,
      userId: 'user-1',
      conversationRef: 'conv-1',
      userQuery: 'hello',
      assistantResponse: 'world',
      memoryEnabled: false,
    });

    expect(localRuntime.rpc).not.toHaveBeenCalled();
  });
});
