/** @jest-environment node */

const {
  buildBackendQueryPayload,
  buildQueryPayload,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
} = require('../../frontend/src/main/ipc/ipc_query_runtime.cjs');
const {
  resolveConversationRef,
  buildQueryInterrupted: buildQueryInterruptedEvent,
} = require('../../frontend/src/main/ipc/ipc_query_events.cjs');
const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

describe('ipc_query_runtime', () => {
  test('buildBackendQueryPayload keeps the exact backend query contract keys', () => {
    expect(buildBackendQueryPayload({
      text: 'hello',
      conversation_ref: 'conv-1',
      content: '<user_query>hello</user_query>',
      screenshot: 'data:image/png;base64,abc',
      screenshot_ref: 'artifact-1',
      screenshot_refs: ['artifact-1'],
      screenshot_url: 'http://localhost/artifact-1',
      capture_meta: { displayId: 1 },
      attachment_context: 'local only',
      attachment_filenames: ['notes.txt'],
      memory_retrieval_enabled: false,
      workspace_path: '/tmp/workspace',
      repo_instruction_messages: [],
      client_prompt_layers: [],
      turn_ref: 'legacy-turn',
      query_message_id: 'query-1',
      unknown_backend_field: true,
      system_state_internal: { screen_resolution: '1920x1080' },
      agent_definition: { mode: 'custom' },
    })).toEqual({
      text: 'hello',
      conversation_ref: 'conv-1',
      content: '<user_query>hello</user_query>',
      screenshot: 'data:image/png;base64,abc',
      screenshot_ref: 'artifact-1',
      screenshot_refs: ['artifact-1'],
      capture_meta: { displayId: 1 },
      system_state_internal: { screen_resolution: '1920x1080' },
      attachment_context: 'local only',
      attachment_filenames: ['notes.txt'],
      memory_retrieval_enabled: false,
      workspace_path: '/tmp/workspace',
      repo_instruction_messages: [],
      client_prompt_layers: [],
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
        attachment_context: 'file context',
        attachment_filenames: ['notes.txt', 'todo.md'],
        memory_retrieval_enabled: false,
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

  test('buildQueryPayload preserves SDK-bound payload and reports initial-context usage', async () => {
    await expect(buildQueryPayload({
      basePayload: {
        text: 'hello',
        conversation_ref: 'conv-1',
        attachment_context: 'notes',
        memory_retrieval_enabled: true,
      },
      conversationRef: 'conv-1',
      currentUserId: 'user-1',
      isFirstQuery: true,
    })).resolves.toEqual({
      payload: {
        text: 'hello',
        conversation_ref: 'conv-1',
        attachment_context: 'notes',
        memory_retrieval_enabled: true,
      },
      userId: 'user-1',
      conversationRef: 'conv-1',
      queryUsedInitialContext: true,
    });
  });

  test('buildQueryInterrupted marks active accepted turns as retryable errors', () => {
    expect(buildQueryInterruptedEvent({
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      currentSessionId: 'session-1',
      currentServerUserId: 'server-user-1',
      currentUserId: 'client-user-1',
      accepted: true,
      copy: mainHostSkin.queryEvents,
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

  test('resolveConversationRef accepts direct and wrapped command payloads', () => {
    expect(resolveConversationRef({
      conversation_ref: ' conv-direct ',
    })).toBe('conv-direct');
    expect(resolveConversationRef({
      payload: {
        conversation_ref: ' conv-wrapped ',
      },
    })).toBe('conv-wrapped');
  });
});
