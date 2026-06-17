/**
 * Covers Agent SDK package boundary behavior in the frontend test suite.
 */

import {
  AgentClient,
  Agent,
  AgentHostedBackendClient,
  AgentSession,
  WindieAgent,
  WindieClient,
  WindieSdkClient,
  WindieAgentSession,
  InMemoryConversationStore,
  LocalRuntimeConversationStore,
  SidecarConversationStore,
  SdkConversationRuntime,
  SDK_RUNTIME_COMMANDS,
  ToolExecutionCoordinator,
  AgentLocalRuntimeHttpClient,
  SidecarDaemonHttpClient,
  AgentChatSession,
  agentBuiltins,
  buildDisplayConversation,
  createAgentBackendSocket,
  createAgentBackendTransport,
  createAgentLocalRuntimeProvider,
  createAgentSession,
  ManagedAgentSession,
  ManagedWindieAgentSession,
  createConversationRuntime,
  createManagedAgentSession,
  createWindieLocalRuntimeProvider,
  createWindieAgentBackendTransport,
  createWindieAgentSession,
  createWindieSdkBackendSocket,
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
  type AgentStopOptions,
  type AgentStoreMemoryInput,
  type AgentTraceOptions,
  type AgentWakeUpOptions,
  type AgentLocalRuntimeClient,
  type AgentQueryInput,
  type AgentSessionRuntime,
  type AgentStopInput,
  type AgentToolDefinition,
  type WindieClientOptions,
  type WindieInstallIdentityResponse,
  type WindieSdkBackendSocketOptions,
  type WindieSdkClientOptions,
  type WindieSdkQueryOptions,
  type WindieBuiltinSelection,
  type WindieBuiltinToolSelection,
  type WindieInstallAuthOptions,
  type WindieLocalRuntimeRequest,
  type WindieLocalRuntimeClient,
  type WindieAgentQueryInput,
  type WindieAgentSessionRuntime,
  type WindieAgentStreamEvent,
  type WindieAgentStopInput,
  type WindieToolDefinition,
  type WindieChatSendInput,
  type WindieMemoryQuery,
  type WindieAgentQueryOptions,
  type WindieAgentStopOptions,
  type WindieAgentTraceOptions,
  type WindieRuntimeFeatureOption,
  type WindieStoreMemoryInput,
  type WindieWakeUpOptions,
} from '../../packages/windie-sdk-js/src';

describe('@windie/sdk package boundary', () => {
  test('exports the public agent runtime surface', () => {
    expect(WindieClient).toBeDefined();
    expect(WindieClient).toBe(AgentClient);
    expect(WindieAgent).toBe(Agent);
    expect(WindieSdkClient).toBeDefined();
    expect(WindieSdkClient).toBe(AgentHostedBackendClient);
    expect(InMemoryConversationStore).toBeDefined();
    expect(LocalRuntimeConversationStore).toBeDefined();
    expect(SidecarConversationStore).toBe(LocalRuntimeConversationStore);
    expect(AgentLocalRuntimeHttpClient).toBeDefined();
    expect(SidecarDaemonHttpClient).toBe(AgentLocalRuntimeHttpClient);
    expect(SdkConversationRuntime).toBeDefined();
    expect(SDK_RUNTIME_COMMANDS).toBeDefined();
    expect(createConversationRuntime).toBeDefined();
    expect(ToolExecutionCoordinator).toBeDefined();
    expect(agentBuiltins.desktop()).toEqual({ builtins: 'default' });
    expect(windieBuiltins).toBe(agentBuiltins);
    expect(createWindieAgentSession).toBe(createAgentSession);
    expect(createWindieAgentBackendTransport).toBe(createAgentBackendTransport);
    expect(createWindieSdkBackendSocket).toBe(createAgentBackendSocket);
    expect(ManagedWindieAgentSession).toBe(ManagedAgentSession);
    expect(createManagedWindieAgentSession).toBe(createManagedAgentSession);
    expect(WindieAgentSession).toBe(AgentSession);
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

  test('exports generic backend socket factory aliases', () => {
    class FakeWebSocket {
      constructor(readonly url: string) {}
    }
    const options: AgentBackendSocketOptions = {
      WebSocketImpl: FakeWebSocket,
      wsUrl: 'wss://socket.example.test/ws',
    };
    const compatibilityOptions: WindieSdkBackendSocketOptions = options;

    expect(createWindieSdkBackendSocket(compatibilityOptions)).toBeInstanceOf(FakeWebSocket);
  });

  test('exports generic builtin selection aliases', () => {
    const selection: AgentBuiltinSelection = ['browser'];
    const compatibilitySelection: WindieBuiltinSelection = selection;
    const toolSelection: AgentBuiltinToolSelection = { builtins: compatibilitySelection };
    const compatibilityToolSelection: WindieBuiltinToolSelection = toolSelection;

    expect(windieBuiltins.browser()).toEqual(agentBuiltins.browser());
    expect(compatibilityToolSelection.builtins).toEqual(['browser']);
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

  test('exports generic agent stream event aliases', () => {
    const event: AgentStreamEvent = {
      type: 'state',
      state: 'thinking',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    };
    const compatibilityEvent: WindieAgentStreamEvent = event;

    expect(compatibilityEvent.state).toBe('thinking');
  });

  test('exports generic client runtime option aliases', () => {
    const feature: AgentRuntimeFeatureOption = { enabled: true };
    const compatibilityFeature: WindieRuntimeFeatureOption = feature;
    const installAuth: AgentInstallAuthOptions = { userId: 'user-1', installToken: 'token-1' };
    const compatibilityInstallAuth: WindieInstallAuthOptions = installAuth;
    const wakeUp: AgentWakeUpOptions = {
      name: 'Agent',
      memory: compatibilityFeature,
      installAuth: compatibilityInstallAuth,
    };
    const compatibilityWakeUp: WindieWakeUpOptions = wakeUp;
    const clientOptions: AgentClientOptions = {
      backendSession: 'managed',
      installAuth,
      memory: feature,
    };
    const compatibilityClientOptions: WindieClientOptions = clientOptions;
    const localRuntimeRequest: AgentLocalRuntimeRequest = { reason: 'test' };
    const compatibilityLocalRuntimeRequest: WindieLocalRuntimeRequest = localRuntimeRequest;

    expect(compatibilityWakeUp.installAuth?.userId).toBe('user-1');
    expect(compatibilityClientOptions.backendSession).toBe('managed');
    expect(compatibilityLocalRuntimeRequest.reason).toBe('test');
  });

  test('exports generic hosted backend client aliases', () => {
    const queryOptions: AgentSdkQueryOptions = {
      userId: 'user-1',
      modelId: 'model-1',
      modelProvider: 'provider-1',
      interactionMode: 'agent',
    };
    const compatibilityQueryOptions: WindieSdkQueryOptions = queryOptions;
    const clientOptions: AgentHostedBackendClientOptions = {
      httpBaseUrl: 'https://api.example.test',
      authToken: 'token-1',
    };
    const compatibilityClientOptions: WindieSdkClientOptions = clientOptions;
    const identity: AgentInstallIdentityResponse = {
      success: true,
      user_id: 'user-1',
      install_id: 'install-1',
    };
    const compatibilityIdentity: WindieInstallIdentityResponse = identity;

    expect(compatibilityQueryOptions.interactionMode).toBe('agent');
    expect(compatibilityClientOptions.httpBaseUrl).toBe('https://api.example.test');
    expect(compatibilityIdentity.install_id).toBe('install-1');
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
