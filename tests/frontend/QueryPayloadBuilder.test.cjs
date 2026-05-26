/** @jest-environment node */

const {
  buildQueryPayloadContext,
} = require('../../frontend/src/main/query_payload_builder.cjs');

describe('query_payload_builder', () => {
  test('builds structured query context for initial context', async () => {
    const getSystemState = jest.fn().mockResolvedValue({
      active_window: 'Editor <main>',
      mouse_position: '100,200',
      screen_resolution: '1920x1080',
      windows: ['A', 'B'],
    });
    const searchMemory = jest.fn().mockResolvedValue({
      success: true,
      data: {
        memories: {
          episodic: ['remember & review'],
          semantic: ['facts'],
        },
      },
    });

    const result = await buildQueryPayloadContext({
      text: 'hello <world>',
      conversationRef: 'conv-1',
      userId: 'user-1',
      contextType: 'initial',
      getSystemState,
      searchMemory,
      log: jest.fn(),
    });

    expect(getSystemState).toHaveBeenCalledWith([
      'active_window',
      'mouse_position',
      'screen_resolution',
    ]);
    expect(searchMemory).toHaveBeenCalledWith(
      'hello <world>',
      'user-1',
      6,
      null,
      'conv-1',
      {
        episodic_limit: 4,
        semantic_limit: 2,
        semantic_min_score: 0.2,
      },
    );
    expect(result.queryContext).toEqual({
      memory_retrieval_enabled: true,
      memories: {
        episodic: ['remember & review'],
        semantic: ['facts'],
      },
    });
    expect(result.runtimeSystemState).toEqual({ screen_resolution: '1920x1080' });
  });

  test('keeps query context when system state retrieval fails', async () => {
    const getSystemState = jest.fn().mockRejectedValue(new Error('boom'));
    const searchMemory = jest.fn().mockResolvedValue({
      success: true,
      data: {
        memories: {
          episodic: [],
          semantic: [],
        },
      },
    });

    const result = await buildQueryPayloadContext({
      text: 'fallback',
      conversationRef: null,
      userId: 'user-2',
      contextType: 'sequential',
      getSystemState,
      searchMemory,
      log: jest.fn(),
    });

    expect(getSystemState).toHaveBeenCalledWith([
      'active_window',
      'mouse_position',
      'screen_resolution',
    ]);
    expect(result.queryContext).toEqual({
      memory_retrieval_enabled: true,
      memories: {
        episodic: [],
        semantic: [],
      },
    });
    expect(result.runtimeSystemState).toBeNull();
  });

  test('uses fallback memory sections when memory search rejects', async () => {
    const getSystemState = jest.fn().mockResolvedValue({
      active_window: 'Editor',
      mouse_position: '0,0',
      screen_resolution: '2560x1440',
      windows: ['Editor'],
    });
    const searchMemory = jest.fn().mockRejectedValue(new Error('memory backend unavailable'));

    const result = await buildQueryPayloadContext({
      text: 'memory fallback',
      conversationRef: 'conv-mem',
      userId: 'user-3',
      contextType: 'initial',
      getSystemState,
      searchMemory,
      log: jest.fn(),
    });

    expect(result.queryContext).toEqual({
      memory_retrieval_enabled: true,
      memories: null,
    });
    expect(result.runtimeSystemState).toEqual({ screen_resolution: '2560x1440' });
  });

  test('keeps local memory context when system state payload is null', async () => {
    const getSystemState = jest.fn().mockResolvedValue(null);
    const searchMemory = jest.fn().mockResolvedValue({
      success: true,
      data: {
        memories: {
          episodic: ['entry'],
          semantic: [],
        },
      },
    });

    const result = await buildQueryPayloadContext({
      text: 'null state',
      conversationRef: 'conv-null',
      userId: 'user-4',
      contextType: 'initial',
      getSystemState,
      searchMemory,
      log: jest.fn(),
    });

    expect(result.queryContext).toEqual({
      memory_retrieval_enabled: true,
      memories: {
        episodic: ['entry'],
        semantic: [],
      },
    });
    expect(result.runtimeSystemState).toBeNull();
  });

  test('skips memory search when memory retrieval injection is disabled', async () => {
    const getSystemState = jest.fn().mockResolvedValue({
      active_window: 'Editor',
      mouse_position: '0,0',
      screen_resolution: '2560x1440',
      windows: ['Editor'],
    });
    const searchMemory = jest.fn().mockResolvedValue({
      success: true,
      data: {
        memories: {
          episodic: ['entry'],
          semantic: ['fact'],
        },
      },
    });

    const result = await buildQueryPayloadContext({
      text: 'no memory injection',
      conversationRef: 'conv-no-memory',
      userId: 'user-5',
      contextType: 'initial',
      getSystemState,
      searchMemory,
      memoryRetrievalEnabled: false,
      log: jest.fn(),
    });

    expect(searchMemory).not.toHaveBeenCalled();
    expect(result.queryContext).toEqual({
      memory_retrieval_enabled: false,
    });
  });
});
