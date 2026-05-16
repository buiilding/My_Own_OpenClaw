import {
  WindieClient,
  WindieSdkClient,
  InMemoryConversationStore,
  SdkConversationRuntime,
  ToolExecutionCoordinator,
  buildDisplayConversation,
  createConversationRuntime,
  moduleTool,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
  resolveToolWaitId,
} from '../../packages/windie-sdk-js/src';

describe('@windie/sdk package boundary', () => {
  test('exports the public agent runtime surface', () => {
    expect(WindieClient).toBeDefined();
    expect(WindieSdkClient).toBeDefined();
    expect(InMemoryConversationStore).toBeDefined();
    expect(SdkConversationRuntime).toBeDefined();
    expect(createConversationRuntime).toBeDefined();
    expect(ToolExecutionCoordinator).toBeDefined();
    expect(buildDisplayConversation).toBeDefined();
    expect(resolveToolCallCorrelationId).toBeDefined();
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
      metadata: { request_id: '   ' },
      tool_call_id: ' call-output-1 ',
    }, 'event-1')).toBe('call-output-1');
    expect(resolveToolWaitId({
      request_id: '   ',
      correlation_id: '   ',
      tool_call_id: ' call-wait-1 ',
    })).toBe('call-wait-1');
  });
});
