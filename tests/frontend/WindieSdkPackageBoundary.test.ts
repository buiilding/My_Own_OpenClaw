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
  AgentChatSession,
  agentBuiltins,
  buildDisplayConversation,
  createAgentBackendTransport,
  createAgentLocalRuntimeProvider,
  createAgentSession,
  createConversationRuntime,
  createManagedAgentSession,
  createWindieLocalRuntimeProvider,
  createWindieAgentBackendTransport,
  createWindieAgentSession,
  createManagedWindieAgentSession,
  moduleTool,
  resolveModelFacingToolCallId,
  resolveToolCallCorrelationId,
  resolveToolEventCorrelationId,
  resolveToolOutputCorrelationId,
  resolveToolWaitId,
  windieBuiltins,
  WindieChatSession,
  type AgentChatSendInput,
  type AgentMemoryQuery,
  type AgentQueryOptions,
  type AgentStopOptions,
  type AgentStoreMemoryInput,
  type AgentTraceOptions,
  type AgentLocalRuntimeClient,
  type AgentQueryInput,
  type AgentSessionRuntime,
  type AgentStopInput,
  type AgentToolDefinition,
  type WindieLocalRuntimeClient,
  type WindieAgentQueryInput,
  type WindieAgentSessionRuntime,
  type WindieAgentStopInput,
  type WindieToolDefinition,
  type WindieChatSendInput,
  type WindieMemoryQuery,
  type WindieAgentQueryOptions,
  type WindieAgentStopOptions,
  type WindieAgentTraceOptions,
  type WindieStoreMemoryInput,
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
    expect(agentBuiltins.desktop()).toEqual({ builtins: 'default' });
    expect(windieBuiltins).toBe(agentBuiltins);
    expect(createWindieAgentSession).toBe(createAgentSession);
    expect(createWindieAgentBackendTransport).toBe(createAgentBackendTransport);
    expect(createManagedWindieAgentSession).toBe(createManagedAgentSession);
    expect(WindieChatSession).toBe(AgentChatSession);
    expect(createWindieLocalRuntimeProvider).toBe(createAgentLocalRuntimeProvider);
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

  test('exports generic agent session contract aliases', () => {
    const query: AgentQueryInput = {
      text: 'hello',
      conversationRef: 'conv-1',
    };
    const compatibilityQuery: WindieAgentQueryInput = query;
    const stop: AgentStopInput = { conversationRef: compatibilityQuery.conversationRef };
    const compatibilityStop: WindieAgentStopInput = stop;
    const runtime: AgentSessionRuntime = {
      waitForOpen: async () => undefined,
      isOpen: () => true,
      on: () => () => undefined,
      query: async payload => payload.conversationRef,
      stopQuery: async input => input?.conversationRef ?? 'stopped',
      updateSettings: async () => 'settings',
      listModels: async () => 'models',
      rehydrateConversation: async () => 'rehydrate',
      compactHistory: async () => 'compact',
      wakewordDetected: async () => 'wakeword',
      sendToolResultPayload: async () => 'tool',
      sendToolBundleResultPayload: async () => 'bundle',
      close: () => undefined,
    };
    const compatibilityRuntime: WindieAgentSessionRuntime = runtime;

    expect(compatibilityQuery.text).toBe('hello');
    expect(compatibilityStop.conversationRef).toBe('conv-1');
    expect(compatibilityRuntime.isOpen()).toBe(true);
  });

  test('exports generic chat session input aliases', () => {
    const input: AgentChatSendInput = 'hello';
    const compatibilityInput: WindieChatSendInput = input;

    expect(compatibilityInput).toBe('hello');
  });

  test('exports generic agent API option aliases', () => {
    const queryOptions: AgentQueryOptions = {
      conversationRef: 'conv-1',
      screenshotRef: 'shot-1',
    };
    const compatibilityQueryOptions: WindieAgentQueryOptions = queryOptions;
    const stopOptions: AgentStopOptions = { conversationRef: compatibilityQueryOptions.conversationRef };
    const compatibilityStopOptions: WindieAgentStopOptions = stopOptions;
    const memoryQuery: AgentMemoryQuery = { query: 'preferences', memoryType: 'semantic' };
    const compatibilityMemoryQuery: WindieMemoryQuery = memoryQuery;
    const storeMemory: AgentStoreMemoryInput = {
      userQuery: 'What should I remember?',
      assistantResponse: 'Remember the workspace preference.',
      memoryType: 'episodic',
    };
    const compatibilityStoreMemory: WindieStoreMemoryInput = storeMemory;
    const traceOptions: AgentTraceOptions = { conversationRef: 'conv-1' };
    const compatibilityTraceOptions: WindieAgentTraceOptions = traceOptions;

    expect(compatibilityStopOptions.conversationRef).toBe('conv-1');
    expect(compatibilityMemoryQuery.memoryType).toBe('semantic');
    expect(compatibilityStoreMemory.memoryType).toBe('episodic');
    expect(compatibilityTraceOptions.conversationRef).toBe('conv-1');
  });

  test('exports generic local runtime contract aliases', () => {
    const tool: AgentToolDefinition = {
      name: 'save_note',
      module: 'example.tools:save_note',
      schema: { type: 'object', properties: {} },
    };
    const compatibilityTool: WindieToolDefinition = tool;
    const runtime: AgentLocalRuntimeClient = {
      registerModuleTool: async () => ({ ok: true }),
    };
    const compatibilityRuntime: WindieLocalRuntimeClient = runtime;

    expect(moduleTool(compatibilityTool as AgentToolDefinition & { module: string })).toMatchObject({
      name: 'save_note',
      execution_target: 'sidecar',
      argument_resolution: 'passthrough',
    });
    expect(compatibilityRuntime.registerModuleTool).toBeDefined();
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
