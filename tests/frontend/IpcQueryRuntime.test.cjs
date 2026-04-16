/** @jest-environment node */

const {
  buildQueryPayload,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
} = require('../../frontend/src/main/ipc/ipc_query_runtime.cjs');

describe('ipc_query_runtime', () => {
  test('prepareRendererQueryPayload normalizes attachment fields and resolves conversation fallback', () => {
    const result = prepareRendererQueryPayload(
      {
        text: 'hello',
        attachment_context: 'file context',
        attachment_filenames: [' notes.txt ', '', 42, 'todo.md'],
        memory_retrieval_enabled: false,
      },
      'conv-current',
      jest.fn(() => 'conv-resolved'),
    );

    expect(result).toEqual({
      payload: {
        text: 'hello',
        attachment_filenames: ['notes.txt', 'todo.md'],
        conversation_ref: 'conv-resolved',
      },
      attachmentContext: 'file context',
      conversationRef: 'conv-resolved',
      memoryRetrievalEnabled: false,
    });
  });

  test('prepareAutomatedQueryPayload trims text and filenames and falls back to current conversation ref', () => {
    expect(prepareAutomatedQueryPayload({
      text: '  hello  ',
      attachmentContext: '  attached  ',
      attachmentFilenames: [' one.txt ', '', 'two.txt'],
      memoryRetrievalEnabled: false,
    }, 'conv-current')).toEqual({
      text: 'hello',
      conversationRef: 'conv-current',
      attachmentContext: 'attached',
      attachmentFilenames: ['one.txt', 'two.txt'],
      memoryRetrievalEnabled: false,
    });
  });

  test('buildQueryPayload enriches the payload and reports initial-context usage', async () => {
    const buildQueryPayloadContent = jest.fn().mockResolvedValue({
      content: '<user_query>\nhello\n</user_query>',
      runtimeSystemState: { screen_resolution: '1920x1080' },
    });

    await expect(buildQueryPayload({
      basePayload: { text: 'hello', conversation_ref: 'conv-1' },
      text: 'hello',
      conversationRef: 'conv-1',
      currentUserId: 'user-1',
      isFirstQuery: true,
      attachmentContext: 'notes',
      memoryRetrievalEnabled: true,
      buildQueryPayloadContent,
      getSystemState: jest.fn(),
      searchMemory: jest.fn(),
      log: jest.fn(),
    })).resolves.toEqual({
      payload: {
        text: 'hello',
        conversation_ref: 'conv-1',
        content: '<user_query>\nhello\n</user_query>',
        system_state_internal: { screen_resolution: '1920x1080' },
      },
      userId: 'user-1',
      conversationRef: 'conv-1',
      queryUsedInitialContext: true,
    });

    expect(buildQueryPayloadContent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'hello',
      conversationRef: 'conv-1',
      userId: 'user-1',
      contextType: 'initial',
      attachmentContext: 'notes',
      memoryRetrievalEnabled: true,
    }));
  });
});
