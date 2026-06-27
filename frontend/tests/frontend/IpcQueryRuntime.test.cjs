/** @jest-environment node */

const {
  buildBackendQueryPayload,
  buildQueryPayload,
  buildRendererBackendQueryPayloadWithAgentDefinition,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
} = require('../../src/main/ipc/ipc_query_runtime.cjs');
const {
  createQueryEventsRuntime,
} = require('../../src/main/ipc/ipc_query_events.cjs');

const sampleQueryEventsCopy = Object.freeze({
  interruptedAfterAccept: 'Sample app lost connection after accepting the message. Retry after reconnecting.',
});

describe('ipc_query_runtime', () => {
  test('keeps lower-level SDK turn field preservation private', () => {
    const queryRuntimeModule = require('../../src/main/ipc/ipc_query_runtime.cjs');

    expect(queryRuntimeModule.preserveSdkTurnInputFields).toBeUndefined();
    expect(typeof queryRuntimeModule.buildRendererBackendQueryPayloadWithAgentDefinition).toBe('function');
  });

  test('keeps lower-level query event helpers private', () => {
    const queryEventsModule = require('../../src/main/ipc/ipc_query_events.cjs');

    expect(queryEventsModule.resolveConversationRef).toBeUndefined();
    expect(queryEventsModule.buildQuerySendFailure).toBeUndefined();
    expect(queryEventsModule.buildQueryInterrupted).toBeUndefined();
    expect(typeof queryEventsModule.createQueryEventsRuntime).toBe('function');
  });

  test('buildBackendQueryPayload keeps the exact backend query contract keys', () => {
    expect(buildBackendQueryPayload({
      text: 'hello',
      conversation_ref: 'conv-1',
      content: '<user_query>hello</user_query>',
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
      model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4-5' },
    })).toEqual({
      text: 'hello',
      conversation_ref: 'conv-1',
      content: '<user_query>hello</user_query>',
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

  test('renderer backend payload context facade preserves SDK turn input fields', () => {
    const payload = buildRendererBackendQueryPayloadWithAgentDefinition({
      payload: {
        text: 'hello',
        conversation_ref: 'conv-1',
        resources: [{ type: 'screenshot', id: 'resource-1' }],
        metadata: { query_message_id: 'turn-1' },
        turn_ref: 'envelope-only',
      },
      attachAgentDefinitionContext: (input) => ({
        ...input,
        agent_definition: { id: 'agent-1' },
      }),
    });

    expect(payload).toEqual({
      text: 'hello',
      conversation_ref: 'conv-1',
      resources: [{ type: 'screenshot', id: 'resource-1' }],
      metadata: { query_message_id: 'turn-1' },
      agent_definition: { id: 'agent-1' },
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

  test('prepareRendererQueryPayload rejects removed query id aliases', () => {
    expect(() => prepareRendererQueryPayload(
      {
        text: 'hello',
        conversation_ref: 'conv-1',
        queryMessageId: 'turn-camel',
        messageId: 'turn-message',
      },
      'conv-current',
      jest.fn(() => 'conv-1'),
    )).toThrow(
      'Renderer query command requires query_message_id; removed field(s): queryMessageId, messageId.',
    );
    expect(() => prepareRendererQueryPayload(
      {
        text: 'hello',
        conversation_ref: 'conv-1',
        id: 'turn-id',
        message_id: 'turn-snake',
        turnRef: 'turn-ref',
        turn_ref: 'turn-snake-ref',
      },
      'conv-current',
      jest.fn(() => 'conv-1'),
    )).toThrow(
      'Renderer query command requires query_message_id; removed field(s): turn_ref, turnRef, id, message_id.',
    );
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
    const queryEventsRuntime = createQueryEventsRuntime();

    expect(queryEventsRuntime.buildQueryInterrupted({
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      currentSessionId: 'session-1',
      currentServerUserId: 'server-user-1',
      currentUserId: 'client-user-1',
      accepted: true,
      copy: sampleQueryEventsCopy,
    })).toEqual({
      type: 'error',
      id: 'turn-1',
      turn_ref: 'turn-1',
      session_id: 'session-1',
      user_id: 'server-user-1',
      conversation_ref: 'conv-1',
      payload: {
        message: 'Sample app lost connection after accepting the message. Retry after reconnecting.',
        interrupted: true,
        accepted: true,
      },
    });
  });

  test('query events runtime applies dynamic host copy to send failures', () => {
    const getCopy = jest.fn(() => ({
      sendFailure: 'Sample app is offline. Try again after reconnecting.',
    }));
    const queryEventsRuntime = createQueryEventsRuntime({ getCopy });

    expect(queryEventsRuntime.buildQuerySendFailure({
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      currentSessionId: 'session-1',
      currentServerUserId: null,
      currentUserId: 'client-user-1',
    })).toEqual({
      type: 'error',
      id: 'turn-1',
      event_id: 'turn-1:query-send-failed',
      sequence: 1,
      turn_ref: 'turn-1',
      session_id: 'session-1',
      user_id: 'client-user-1',
      conversation_ref: 'conv-1',
      payload: {
        message: 'Sample app is offline. Try again after reconnecting.',
      },
    });
    expect(getCopy).toHaveBeenCalledTimes(1);
  });

  test('query events runtime accepts direct and wrapped command payloads', () => {
    const queryEventsRuntime = createQueryEventsRuntime();

    expect(queryEventsRuntime.resolveConversationRefFromPayload({
      conversation_ref: ' conv-direct ',
    })).toBe('conv-direct');
    expect(queryEventsRuntime.resolveConversationRefFromPayload({
      payload: {
        conversation_ref: ' conv-wrapped ',
      },
    })).toBe('conv-wrapped');
  });
});
