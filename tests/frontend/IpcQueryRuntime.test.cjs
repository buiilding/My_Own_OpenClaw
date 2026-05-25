/** @jest-environment node */

const {
  BACKEND_QUERY_PAYLOAD_KEYS,
  buildBackendQueryPayload,
  buildQueryPayload,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
} = require('../../frontend/src/main/ipc/ipc_query_runtime.cjs');
const {
  buildQueryInterrupted: buildQueryInterruptedEvent,
} = require('../../frontend/src/main/ipc/ipc_query_events.cjs');

describe('ipc_query_runtime', () => {
  test('buildBackendQueryPayload keeps the exact backend query contract keys', () => {
    expect(BACKEND_QUERY_PAYLOAD_KEYS).toEqual([
      'text',
      'conversation_ref',
      'content',
      'screenshot',
      'screenshot_ref',
      'screenshot_refs',
      'capture_meta',
      'system_state_internal',
      'workspace_path',
      'repo_instruction_messages',
      'client_prompt_layers',
      'agent_definition',
    ]);

    expect(buildBackendQueryPayload({
      text: 'hello',
      conversation_ref: 'conv-1',
      content: '<user_query>hello</user_query>',
      screenshot_ref: 'artifact-1',
      screenshot_url: 'http://localhost/artifact-1',
      attachment_context: 'local only',
      attachment_filenames: ['notes.txt'],
      memory_retrieval_enabled: false,
      turn_ref: 'legacy-turn',
      query_message_id: 'query-1',
      unknown_backend_field: true,
      system_state_internal: { screen_resolution: '1920x1080' },
      agent_definition: { mode: 'custom' },
    })).toEqual({
      text: 'hello',
      conversation_ref: 'conv-1',
      content: '<user_query>hello</user_query>',
      screenshot_ref: 'artifact-1',
      system_state_internal: { screen_resolution: '1920x1080' },
      agent_definition: { mode: 'custom' },
    });
  });

  test('prepareRendererQueryPayload normalizes attachment fields and requires resolved conversation ref', () => {
    const result = prepareRendererQueryPayload(
      {
        text: 'hello',
        attachment_context: 'file context',
        attachment_filenames: [' notes.txt ', '', 42, 'todo.md'],
        memory_retrieval_enabled: false,
        query_message_id: ' turn-transport ',
        turn_ref: 'legacy-turn',
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
      queryMessageId: 'turn-transport',
    });
  });

  test('prepareRendererQueryPayload rejects missing conversation ref', () => {
    expect(() => prepareRendererQueryPayload(
      { text: 'hello' },
      'conv-current',
      jest.fn(() => null),
    )).toThrow('Renderer query requires explicit conversation_ref');
  });

  test('prepareAutomatedQueryPayload trims text and filenames without current conversation fallback', () => {
    expect(prepareAutomatedQueryPayload({
      text: '  hello  ',
      conversationRef: 'conv-explicit',
      attachmentContext: '  attached  ',
      attachmentFilenames: [' one.txt ', '', 'two.txt'],
      memoryRetrievalEnabled: false,
    }, 'conv-current')).toEqual({
      text: 'hello',
      conversationRef: 'conv-explicit',
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

  test('buildQueryInterrupted marks active accepted turns as retryable errors', () => {
    expect(buildQueryInterruptedEvent({
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      currentSessionId: 'session-1',
      currentServerUserId: 'server-user-1',
      currentUserId: 'client-user-1',
      accepted: true,
    })).toEqual({
      type: 'error',
      id: 'turn-1',
      turn_ref: 'turn-1',
      session_id: 'session-1',
      user_id: 'server-user-1',
      conversation_ref: 'conv-1',
      payload: {
        message: 'WindieOS lost connection before the response finished. Retry this message after reconnecting.',
        interrupted: true,
        accepted: true,
      },
    });
  });
});
