/**
 * Covers Agent SDK package boundary behavior in the frontend test suite.
 */

import {
  AgentClient,
  Agent,
  AgentHostedBackendClient,
  AgentSession,
  InMemoryConversationStore,
  LocalRuntimeConversationStore,
  SdkConversationRuntime,
  SDK_RUNTIME_COMMANDS,
  ToolExecutionCoordinator,
  AgentLocalRuntimeHttpClient,
  AgentChatSession,
  agentBuiltins,
  buildDisplayConversation,
  isDefaultAgentDefinition,
  createAgentBackendSocket,
  createAgentBackendTransport,
  createAgentLocalRuntimeProvider,
  createAgentSession,
  ManagedAgentSession,
  createConversationRuntime,
  createManagedAgentSession,
  moduleTool,
  resolveModelFacingToolCallId,
  resolveToolCallCorrelationId,
  resolveToolEventCorrelationId,
  resolveToolOutputCorrelationId,
  resolveToolWaitId,
  type AgentChatSendInput,
  type AgentClientOptions,
  type AgentInstallAuthOptions,
  type AgentHostedBackendClientOptions,
  type AgentInstallIdentityResponse,
  type AgentLocalRuntimeRequest,
  type AgentMemoryQuery,
  type AgentQueryOptions,
  type AgentRuntimeFeatureOption,
  type AgentSdkQueryOptions,
  type AgentStreamEvent,
  type AgentBackendSocketOptions,
  type AgentBuiltinSelection,
  type AgentBuiltinToolSelection,
  type AgentRuntimeTransport,
  type AgentStopOptions,
  type AgentStoreMemoryInput,
  type AgentTraceOptions,
  type AgentWakeUpOptions,
  type AgentLocalRuntimeClient,
  type AgentLocalRuntimeHttpClientOptions,
  type AgentQueryInput,
  type AgentSessionRuntime,
  type AgentStopInput,
  type AgentToolDefinition,
} from '../../packages/windie-sdk-js/src';

describe('@windie/sdk package boundary', () => {
  test('exports the public agent runtime surface', () => {
    expect(AgentClient).toBeDefined();
    expect(Agent).toBeDefined();
    expect(AgentHostedBackendClient).toBeDefined();
    expect(InMemoryConversationStore).toBeDefined();
    expect(LocalRuntimeConversationStore).toBeDefined();
    expect(AgentLocalRuntimeHttpClient).toBeDefined();
    expect(SdkConversationRuntime).toBeDefined();
    expect(SDK_RUNTIME_COMMANDS).toBeDefined();
    expect(createConversationRuntime).toBeDefined();
    expect(ToolExecutionCoordinator).toBeDefined();
    expect(agentBuiltins.desktop()).toEqual({ builtins: 'default' });
    expect(createAgentSession).toBeDefined();
    expect(createAgentBackendTransport).toBeDefined();
    expect(ManagedAgentSession).toBeDefined();
    expect(createManagedAgentSession).toBeDefined();
    expect(AgentSession).toBeDefined();
    expect(AgentChatSession).toBeDefined();
    expect(createAgentLocalRuntimeProvider).toBeDefined();
    expect(isDefaultAgentDefinition({ mode: 'default' })).toBe(true);
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

  test('exports generic agent session contracts', async () => {
    const query: AgentQueryInput = {
      text: 'hello',
      conversationRef: 'conv-1',
    };
    const stop: AgentStopInput = { conversationRef: query.conversationRef };
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
    const transport: AgentRuntimeTransport = {
      connect: async () => undefined,
      handshake: async () => undefined,
      sendQuery: async () => 'message-1',
      sendToolResult: async () => undefined,
      sendToolBundleResult: async () => undefined,
      rehydrateConversation: async () => undefined,
      compactHistory: async () => 'compact',
      wakewordDetected: async () => 'wakeword',
      updateSettings: async () => 'settings',
      listModels: async () => 'models',
      stop: async () => undefined,
      subscribe: () => () => undefined,
      close: async () => undefined,
    };
    expect(query.text).toBe('hello');
    expect(stop.conversationRef).toBe('conv-1');
    expect('conversation_ref' in stop).toBe(false);
    expect(runtime.isOpen()).toBe(true);
    expect(await transport.sendQuery({ text: 'hello', conversation_ref: 'conv-1' })).toBe('message-1');
  });

  test('exports generic backend socket factory helpers', () => {
    class FakeWebSocket {
      constructor(readonly url: string) {}
    }
    const options: AgentBackendSocketOptions = {
      WebSocketImpl: FakeWebSocket,
      wsUrl: 'wss://socket.example.test/ws',
    };

    expect(createAgentBackendSocket(options)).toBeInstanceOf(FakeWebSocket);
  });

  test('exports generic builtin selection helpers', () => {
    const selection: AgentBuiltinSelection = ['browser'];
    const toolSelection: AgentBuiltinToolSelection = { builtins: selection };

    expect(agentBuiltins.browser()).toEqual({ builtins: ['browser'] });
    expect(toolSelection.builtins).toEqual(['browser']);
  });

  test('exports generic chat session input aliases', () => {
    const input: AgentChatSendInput = 'hello';

    expect(input).toBe('hello');
  });

  test('exports generic agent API option types', () => {
    const queryOptions: AgentQueryOptions = {
      conversationRef: 'conv-1',
      screenshotRef: 'shot-1',
    };
    const stopOptions: AgentStopOptions = { conversationRef: queryOptions.conversationRef };
    const memoryQuery: AgentMemoryQuery = { query: 'preferences', memoryType: 'semantic' };
    const storeMemory: AgentStoreMemoryInput = {
      userQuery: 'What should I remember?',
      assistantResponse: 'Remember the workspace preference.',
      memoryType: 'episodic',
    };
    const traceOptions: AgentTraceOptions = { conversationRef: 'conv-1' };

    expect(stopOptions.conversationRef).toBe('conv-1');
    expect(memoryQuery.memoryType).toBe('semantic');
    expect(storeMemory.memoryType).toBe('episodic');
    expect(traceOptions.conversationRef).toBe('conv-1');
  });

  test('exports generic agent stream event types', () => {
    const event: AgentStreamEvent = {
      type: 'state',
      state: 'thinking',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    };

    expect(event.state).toBe('thinking');
  });

  test('exports generic client runtime option types', () => {
    const feature: AgentRuntimeFeatureOption = { enabled: true };
    const installAuth: AgentInstallAuthOptions = { userId: 'user-1', installToken: 'token-1' };
    const wakeUp: AgentWakeUpOptions = {
      name: 'Agent',
      memory: feature,
      installAuth,
    };
    const clientOptions: AgentClientOptions = {
      backendSession: 'managed',
      installAuth,
      memory: feature,
    };
    const localRuntimeRequest: AgentLocalRuntimeRequest = { reason: 'test' };

    expect(wakeUp.installAuth?.userId).toBe('user-1');
    expect(clientOptions.backendSession).toBe('managed');
    expect(localRuntimeRequest.reason).toBe('test');
  });

  test('exports generic hosted backend client types', () => {
    const queryOptions: AgentSdkQueryOptions = {
      userId: 'user-1',
      modelId: 'model-1',
      modelProvider: 'provider-1',
      interactionMode: 'agent',
    };
    const clientOptions: AgentHostedBackendClientOptions = {
      httpBaseUrl: 'https://api.example.test',
      authToken: 'token-1',
    };
    const identity: AgentInstallIdentityResponse = {
      success: true,
      user_id: 'user-1',
      install_id: 'install-1',
    };

    expect(queryOptions.interactionMode).toBe('agent');
    expect(clientOptions.httpBaseUrl).toBe('https://api.example.test');
    expect(identity.install_id).toBe('install-1');
  });

  test('exports generic local runtime contract aliases', () => {
    const clientOptions: AgentLocalRuntimeHttpClientOptions = {
      baseUrl: 'http://127.0.0.1:43132',
      token: 'token-1',
    };
    const tool: AgentToolDefinition = {
      name: 'save_note',
      module: 'example.tools:save_note',
      schema: { type: 'object', properties: {} },
    };
    const runtime: AgentLocalRuntimeClient = {
      registerModuleTool: async () => ({ ok: true }),
    };

    expect(moduleTool(tool as AgentToolDefinition & { module: string })).toMatchObject({
      name: 'save_note',
      execution_target: 'sidecar',
      argument_resolution: 'passthrough',
    });
    expect(clientOptions.baseUrl).toBe('http://127.0.0.1:43132');
    expect(runtime.registerModuleTool).toBeDefined();
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
