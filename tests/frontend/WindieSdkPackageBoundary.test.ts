/**
 * Covers windie sdk package boundary. behavior in the frontend test suite.
 */

import {
  WindieClient,
  WindieSdkClient,
  InMemoryConversationStore,
  SdkConversationRuntime,
  SDK_RUNTIME_COMMANDS,
  ToolExecutionCoordinator,
  buildDisplayConversation,
  createConversationRuntime,
  moduleTool,
  resolveModelFacingToolCallId,
  resolveToolCallCorrelationId,
  resolveToolEventCorrelationId,
  resolveToolOutputCorrelationId,
  resolveToolWaitId,
} from '../../packages/windie-sdk-js/src';

describe('@windie/sdk package boundary', () => {
  test('exports the public agent runtime surface', () => {
    expect(WindieClient).toBeDefined();
    expect(WindieSdkClient).toBeDefined();
    expect(InMemoryConversationStore).toBeDefined();
    expect(SdkConversationRuntime).toBeDefined();
    expect(SDK_RUNTIME_COMMANDS).toBeDefined();
    expect(createConversationRuntime).toBeDefined();
    expect(ToolExecutionCoordinator).toBeDefined();
    expect(buildDisplayConversation).toBeDefined();
    expect(resolveModelFacingToolCallId).toBeDefined();
    expect(resolveToolCallCorrelationId).toBeDefined();
    expect(resolveToolEventCorrelationId).toBeDefined();
    expect(resolveToolOutputCorrelationId).toBeDefined();
    expect(resolveToolWaitId).toBeDefined();
    expect(moduleTool({
      name: 'save_note',
      module: 'example.tools:save_note',
      schema: { type: 'object', properties: {} },
    })).toMatchObject({
      name: 'save_note',
      execution_target: 'sidecar',
      argument_resolution: 'passthrough',
    });
  });

  test('exports canonical tool correlation alias resolution', () => {
    expect(resolveToolCallCorrelationId({
      correlation_id: '   ',
      request_id: '   ',
      tool_call_id: ' call-1 ',
    })).toBe('call-1');

    expect(resolveToolOutputCorrelationId({
      request_id: '   ',
      tool_call_id: ' call-output-1 ',
    }, 'event-1')).toBe('call-output-1');
    expect(resolveToolWaitId({
      request_id: '   ',
      correlation_id: '   ',
      tool_call_id: ' call-wait-1 ',
    })).toBe('call-wait-1');
    expect(resolveToolEventCorrelationId({
      request_id: '   ',
      bundle_id: '   ',
      tool_call_id: ' call-event-1 ',
      correlation_id: ' corr-event-1 ',
    })).toBe('call-event-1');
    expect(resolveModelFacingToolCallId({
      metadata: {
        model_facing_tool_call: { id: ' model-facing-call-1 ' },
      },
    })).toBe('model-facing-call-1');
  });

  test('exports SDK-shaped host command names', () => {
    expect(SDK_RUNTIME_COMMANDS).toEqual(expect.objectContaining({
      CONVERSATION_SEND: 'conversation.send',
      CONVERSATION_STOP: 'conversation.stop',
      CONVERSATION_REHYDRATE: 'conversation.rehydrate',
      CONVERSATIONS_LIST: 'conversations.list',
      MEMORIES_LIST: 'memories.list',
      SETTINGS_UPDATE: 'settings.update',
      MODELS_LIST: 'models.list',
      WAKEWORD_DETECTED: 'wakeword.detected',
      DIAGNOSTICS_APPEND: 'diagnostics.append',
    }));
  });
});
