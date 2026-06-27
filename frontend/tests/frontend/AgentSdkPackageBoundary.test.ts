/**
 * Covers Agent SDK package boundary behavior in the frontend test suite.
 */

import fs from 'node:fs';
import path from 'node:path';

import * as AgentSdkPackage from '../../packages/windie-sdk-js/src';
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
  createAgentRuntimeTransport,
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
  test('SDK package tests import the package source directly', () => {
    const sdkTestFiles = [
      'tests/frontend/AgentSdkClient.test.ts',
      'tests/frontend/AgentSdkConversationRuntime.test.ts',
      'tests/frontend/AgentSdkFileConversationStore.test.ts',
      'tests/frontend/AgentSdkMockBackendE2E.test.ts',
    ];

    for (const relativePath of sdkTestFiles) {
      const source = fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8');
      expect(source).toContain("from '../../packages/windie-sdk-js/src'");
      expect(source).not.toContain('src/renderer/infrastructure/api/agentSdkClient');
    }
  });

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
    expect(createAgentRuntimeTransport).toBeDefined();
    expect(ManagedAgentSession).toBeDefined();
    expect(createManagedAgentSession).toBeDefined();
    expect(AgentSession).toBeDefined();
    expect(AgentChatSession).toBeDefined();
    expect(AgentChatSession.prototype.onEvent).toBeDefined();
    expect('onConversationEvent' in AgentChatSession.prototype).toBe(false);
    expect(createAgentLocalRuntimeProvider).toBeDefined();
    expect(isDefaultAgentDefinition({ mode: 'default' })).toBe(true);
    expect(buildDisplayConversation).toBeDefined();
    expect(resolveModelFacingToolCallId).toBeDefined();
    expect(resolveToolCallCorrelationId).toBeDefined();
    expect(resolveToolEventCorrelationId).toBeDefined();
    expect(resolveToolOutputCorrelationId).toBeDefined();
    expect(resolveToolWaitId).toBeDefined();
    expect('resolveCorrelationId' in AgentSdkPackage).toBe(false);
    expect('resolveToolBundleCorrelationId' in AgentSdkPackage).toBe(false);
    expect('resolveToolOutputCorrelationKeys' in AgentSdkPackage).toBe(false);
    expect('resolveToolOutputDedupeKey' in AgentSdkPackage).toBe(false);
    expect('resolveToolPairKeys' in AgentSdkPackage).toBe(false);
    expect('applyConversationMetadataPagination' in AgentSdkPackage).toBe(false);
    expect('searchConversationMetadata' in AgentSdkPackage).toBe(false);
    expect(moduleTool({
      name: 'save_note',
      module: 'example.tools:save_note',
      schema: { type: 'object', properties: {} },
    })).toMatchObject({
      name: 'save_note',
      execution_target: 'local_runtime',
      argument_resolution: 'passthrough',
    });
    expect('shouldIncludeBuiltinTool' in AgentSdkPackage).toBe(false);
    expect('createInitialConversationRuntimeState' in AgentSdkPackage).toBe(false);
    expect('reduceConversationRuntimeState' in AgentSdkPackage).toBe(false);
    expect('getConversationEventScope' in AgentSdkPackage).toBe(false);
    expect('TraceRecorder' in AgentSdkPackage).toBe(false);
    expect('sanitizeTraceData' in AgentSdkPackage).toBe(false);
    expect('createDefaultTurnResourceResolvers' in AgentSdkPackage).toBe(false);
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

  test('uses AgentRuntimeTransport as the conversation runtime boundary type', () => {
    const conversationTypesSource = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/conversation/types.ts'),
      'utf8',
    );
    const conversationRuntimeSource = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/ConversationRuntime.ts'),
      'utf8',
    );
    const continuitySource = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/ConversationContinuityService.ts'),
      'utf8',
    );
    const frontendArchitectureSource = fs.readFileSync(
      path.resolve(__dirname, '../../docs/architecture/frontend_architecture.md'),
      'utf8',
    );

    expect(conversationTypesSource).toContain('export type AgentRuntimeTransport = {');
    expect(conversationTypesSource).not.toContain('BackendTransport');
    expect(conversationRuntimeSource).toContain('transport?: AgentRuntimeTransport;');
    expect(conversationRuntimeSource).not.toContain('transport?: BackendTransport;');
    expect(conversationRuntimeSource).not.toContain('requires a backend transport');
    expect(conversationRuntimeSource).toContain('requires an agent runtime transport');
    expect(continuitySource).toContain("Pick<AgentRuntimeTransport, 'rehydrateConversation'>");
    expect(continuitySource).not.toContain("Pick<BackendTransport, 'rehydrateConversation'>");
    expect(continuitySource).not.toContain('requires a backend transport');
    expect(continuitySource).toContain('requires an agent runtime transport');
    expect(frontendArchitectureSource).toContain('ConversationStore` and `AgentRuntimeTransport');
    expect(frontendArchitectureSource).not.toContain('ConversationStore` and `BackendTransport');

    const agentSource = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/Agent.ts'),
      'utf8',
    );
    expect(agentSource).toContain('createAgentRuntimeTransport');
    expect(agentSource).not.toContain('createAgentBackendTransport');
  });

  test('keeps provider-specific web search labels out of SDK projections', () => {
    const projectionSource = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/projections/conversationProjections.ts'),
      'utf8',
    );
    const projectionCjsSource = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/cjs/projections/conversationProjections.js'),
      'utf8',
    );

    expect(projectionSource).toContain('Native web_search activity:');
    expect(projectionCjsSource).toContain('Native web_search activity:');
    expect(projectionSource).not.toContain('OpenAI native web search');
    expect(projectionSource).not.toContain('OpenAI native web_search activity');
    expect(projectionCjsSource).not.toContain('OpenAI native web search');
    expect(projectionCjsSource).not.toContain('OpenAI native web_search activity');
  });

  test('exports generic backend socket factory helpers', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/transport/ManagedWebSocketSession.ts'),
      'utf8',
    );
    const retiredManagedBackendSessionPath = path.resolve(
      __dirname,
      '../../packages/windie-sdk-js/src/transport/ManagedBackendSession.ts',
    );
    class FakeWebSocket {
      constructor(readonly url: string) {}
    }
    const options: AgentBackendSocketOptions = {
      WebSocketImpl: FakeWebSocket,
      wsUrl: 'wss://socket.example.test/ws',
    };

    expect(source).not.toContain('ManagedBackendSocketFactory');
    expect(source).not.toContain('ManagedBackendSession');
    expect(source).not.toContain('createManagedBackendSession');
    expect(fs.existsSync(retiredManagedBackendSessionPath)).toBe(false);
    expect(createAgentBackendSocket(options)).toBeInstanceOf(FakeWebSocket);
  });

  test('exports generic builtin selection helpers', () => {
    const selection: AgentBuiltinSelection = ['browser'];
    const toolSelection: AgentBuiltinToolSelection = { builtins: selection };

    expect(agentBuiltins.browser()).toEqual({ builtins: ['browser'] });
    expect(toolSelection.builtins).toEqual(['browser']);
  });

  test('uses direct chat session input types without exported aliases', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/AgentChatSession.ts'),
      'utf8',
    );

    expect(source).not.toContain('AgentChatSendInput');
    expect(source).not.toContain('AgentChatEditInput');
    expect(source).not.toContain('AgentChatRetryInput');
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
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/Agent.ts'),
      'utf8',
    );
    const event: AgentStreamEvent = {
      type: 'state',
      state: 'thinking',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    };

    expect(source).toContain('subscribeRawBackendEvents(listener: (event: BackendEvent) => void)');
    expect(source).not.toContain('RawBackendEventListener');
    expect(source).toContain('options: { replace?: boolean } = {}');
    expect(source).not.toContain('AgentRegisterMcpOptions');
    expect(source).not.toContain('LoadConversationOptions');
    expect(source).not.toContain('AgentClearConversationsOptions');
    expect(source).not.toContain('AgentPrepareEditAndResendOptions');
    expect(source).not.toContain('AgentPrepareRetryTurnOptions');
    expect(event.state).toBe('thinking');
    expect('createAgentStreamEventRuntime' in AgentSdkPackage).toBe(false);
    expect('toAgentStreamEvents' in AgentSdkPackage).toBe(false);
    expect('toolOutputStreamKeys' in AgentSdkPackage).toBe(false);
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
      execution_target: 'local_runtime',
      argument_resolution: 'passthrough',
    });
    expect(clientOptions.baseUrl).toBe('http://127.0.0.1:43132');
    expect(runtime.registerModuleTool).toBeDefined();
  });

  test('SDK local-runtime tests avoid stale sidecar fixture labels', () => {
    const sdkClientTestSource = fs.readFileSync(
      path.resolve(__dirname, '../../tests/frontend/AgentSdkClient.test.ts'),
      'utf8',
    );
    const sdkConversationRuntimeTestSource = fs.readFileSync(
      path.resolve(__dirname, '../../tests/frontend/AgentSdkConversationRuntime.test.ts'),
      'utf8',
    );
    const activeSdkLocalRuntimeTestSource = [
      sdkClientTestSource,
      sdkConversationRuntimeTestSource,
    ].join('\n');
    const retiredUnavailableError = 'sidecar ' + 'unavailable';

    expect(activeSdkLocalRuntimeTestSource).not.toContain("const daemonScript = path.join(tempDir, 'sidecar_daemon.py')");
    expect(activeSdkLocalRuntimeTestSource).not.toContain("message: 'sidecar failed'");
    expect(activeSdkLocalRuntimeTestSource).not.toContain("new Error('sidecar failed')");
    expect(activeSdkLocalRuntimeTestSource).not.toContain(`new Error('${retiredUnavailableError}')`);
    expect(activeSdkLocalRuntimeTestSource).not.toContain(`output: '${retiredUnavailableError}'`);
    expect(activeSdkLocalRuntimeTestSource).not.toContain(`error: '${retiredUnavailableError}'`);
    expect(activeSdkLocalRuntimeTestSource).not.toContain("conversation_id: 'conv-sidecar'");
    expect(activeSdkLocalRuntimeTestSource).not.toContain("title: 'Sidecar'");
    expect(activeSdkLocalRuntimeTestSource).not.toContain("pythonArgs: [launcherScript, 'sidecar', 'python']");
    expect(activeSdkLocalRuntimeTestSource).toContain("const daemonScript = path.join(tempDir, 'local_runtime_daemon.py')");
    expect(activeSdkLocalRuntimeTestSource).toContain("message: 'local runtime failed'");
    expect(activeSdkLocalRuntimeTestSource).toContain("new Error('local runtime failed')");
    expect(activeSdkLocalRuntimeTestSource).toContain("new Error('local runtime unavailable')");
    expect(activeSdkLocalRuntimeTestSource).toContain("output: 'local runtime unavailable'");
    expect(activeSdkLocalRuntimeTestSource).toContain("error: 'local runtime unavailable'");
    expect(activeSdkLocalRuntimeTestSource).toContain("conversation_id: 'conv-local-runtime'");
    expect(activeSdkLocalRuntimeTestSource).toContain("title: 'Local runtime'");
    expect(activeSdkLocalRuntimeTestSource).toContain("pythonArgs: [launcherScript, 'local-runtime', 'python']");
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
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts'),
      'utf8',
    );

    expect(source).not.toContain('SdkRuntimeCommand');
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
