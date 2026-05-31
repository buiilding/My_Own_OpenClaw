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
    const localRuntime = {
      rpc: jest.fn(async () => ({ success: true })),
    };

    await storeCompletedTurnMemory({
      localRuntime: localRuntime as never,
      userId: 'user-1',
      conversationRef: 'conv-1',
      userQuery: 'hello',
      assistantResponse: 'world',
    });

    expect(localRuntime.rpc).toHaveBeenCalledWith({
      method: 'store_memory',
      params: {
        user_id: 'user-1',
        user_query: 'hello',
        assistant_response: 'world',
        memory_type: 'episodic',
        session_id: 'conv-1',
      },
    });
  });

  test('disabling memory skips completed-turn memory writes', async () => {
    const localRuntime = {
      rpc: jest.fn(async () => ({ success: true })),
    };

    await storeCompletedTurnMemory({
      localRuntime: localRuntime as never,
      userId: 'user-1',
      conversationRef: 'conv-1',
      userQuery: 'hello',
      assistantResponse: 'world',
      memoryEnabled: false,
    });

    expect(localRuntime.rpc).not.toHaveBeenCalled();
  });
});
