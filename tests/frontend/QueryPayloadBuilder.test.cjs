/** @jest-environment node */

const {
  buildQueryPayloadContent,
} = require('../../frontend/src/main/query_payload_builder.cjs');

describe('query_payload_builder', () => {
  test('builds enriched query content for initial context', async () => {
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

    const result = await buildQueryPayloadContent({
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
      'windows',
    ]);
    expect(searchMemory).toHaveBeenCalledWith(
      'hello <world>',
      'user-1',
      5,
      null,
      'conv-1',
    );
    expect(result.content).toContain('<system_context>');
    expect(result.content).toContain('<episodic_memory>');
    expect(result.content).toContain('- remember &amp; review');
    expect(result.content).toContain('<semantic_memory>');
    expect(result.content).toContain('- facts');
    expect(result.content).toContain('<user_query>\nhello &lt;world&gt;\n</user_query>');
    expect(result.runtimeSystemState).toEqual({ screen_resolution: '1920x1080' });
  });

  test('uses fallback system context when system state retrieval fails', async () => {
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

    const result = await buildQueryPayloadContent({
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
    expect(result.content).toContain('<active_window>Unknown</active_window>');
    expect(result.content).toContain('<episodic_memory>\nNone\n</episodic_memory>');
    expect(result.content).toContain('<semantic_memory>\nNone\n</semantic_memory>');
    expect(result.content).toContain('<user_query>\nfallback\n</user_query>');
    expect(result.runtimeSystemState).toBeNull();
  });
});
