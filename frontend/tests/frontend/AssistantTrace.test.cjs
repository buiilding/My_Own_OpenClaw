/** @jest-environment node */

const {
  createElectronMainTraceLogger,
  createCurrentTurnTraceLogger,
} = require('../../src/main/ipc/ipc_assistant_trace.cjs');

describe('assistant runtime trace logging', () => {
  test('logs compact backend milestones once per turn without raw content', () => {
    const messages = [];
    const appendIpcBridgeDiagnostic = jest.fn();
    const tracer = createElectronMainTraceLogger({
      log: message => messages.push(message),
      appendIpcBridgeDiagnostic,
      stdoutEnabled: true,
    });

    tracer.traceBackendEvent({
      type: 'streaming-response',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: { text: 'private assistant text' },
    });
    tracer.traceBackendEvent({
      type: 'streaming-response',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: { text: 'more private assistant text' },
    });
    tracer.traceBackendEvent({
      type: 'tool-call',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: {
        request_id: 'req-1',
        tool_name: 'run_shell_command',
        parameters: { command: 'private command' },
      },
    });
    tracer.traceBackendEvent({
      type: 'tool-output',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: {
        request_id: 'req-1',
        success: true,
        output: 'private output',
      },
    });
    tracer.traceBackendEvent({
      type: 'streaming-complete',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: { final_response: 'private final' },
    });

    expect(messages).toEqual([
      '[ElectronTrace] backend first_event type=streaming-response turn=turn-1 conv=conv-1 request=- tool=- text_len=22 final_len=0 content_len=0 success=-',
      '[ElectronTrace] backend tool_call type=tool-call turn=turn-1 conv=conv-1 request=req-1 tool=run_shell_command text_len=0 final_len=0 content_len=0 success=-',
      '[ElectronTrace] backend tool_output type=tool-output turn=turn-1 conv=conv-1 request=req-1 tool=- text_len=0 final_len=0 content_len=14 success=true',
      '[ElectronTrace] backend complete type=streaming-complete turn=turn-1 conv=conv-1 request=- tool=- text_len=0 final_len=13 content_len=0 success=-',
    ]);
    expect(JSON.stringify(messages)).not.toContain('private assistant text');
    expect(JSON.stringify(messages)).not.toContain('private command');
    expect(JSON.stringify(messages)).not.toContain('private output');
    expect(JSON.stringify(messages)).not.toContain('private final');
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'first_event',
      phase: 'backend',
      eventType: 'streaming-response',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      textLength: 22,
    }));
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'tool_call',
      toolName: 'run_shell_command',
      requestId: 'req-1',
    }));
    expect(JSON.stringify(appendIpcBridgeDiagnostic.mock.calls)).not.toContain('private command');
    expect(JSON.stringify(appendIpcBridgeDiagnostic.mock.calls)).not.toContain('private output');
  });

  test('logs renderer query, backend connection, and settings as compact lines', () => {
    const messages = [];
    const appendIpcBridgeDiagnostic = jest.fn();
    const tracer = createElectronMainTraceLogger({
      log: message => messages.push(message),
      appendIpcBridgeDiagnostic,
      stdoutEnabled: true,
    });

    tracer.traceBackendConnection({
      type: 'open',
      handshake: { user_id: 'user-1' },
    });
    tracer.traceRendererQuery({
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      rendererPayload: {
        text: 'private user request',
        model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4.5' },
      },
      preparedPayload: {
        text: 'private user request',
        model: { modelProvider: 'anthropic', modelId: 'claude-sonnet-4.5' },
      },
      payload: {
        text: 'private user request',
        resources: [{ kind: 'screenshot' }],
        agent_definition: {
          mode: 'default_plus_overrides',
          system_prompt: { mode: 'replace', content: 'private prompt' },
          tools: {
            mode: 'explicit',
            enabled_remote_tools: ['web_search'],
            disabled_tools: ['mouse_control', 'browser'],
            client_manifest: {
              version: 1,
              tools: [],
            },
          },
        },
      },
    });
    tracer.traceRuntimeSend({
      turnRef: 'turn-1',
      conversationRef: 'conv-1',
      text: 'private user request',
      resources: [{ kind: 'screenshot' }],
      payload: {
        conversation_ref: 'conv-1',
        agent_definition: {
          mode: 'default_plus_overrides',
          system_prompt: { mode: 'replace', content: 'private runtime prompt' },
          tools: {
            mode: 'explicit',
            enabled_remote_tools: [],
            disabled_tools: ['mouse_control', 'browser'],
            client_manifest: {
              version: 1,
              tools: [],
            },
          },
        },
      },
    });
    tracer.traceSettingsUpdate({
      model_provider: 'openai',
      selected_model_id: 'gpt-4.1',
      provider_api_keys: { openai: { api_key: 'sk-secret' } },
    }, 'renderer', 'settings-1');
    tracer.traceBackendEvent({
      type: 'settings-updated',
      id: 'settings-1',
      payload: {},
    });

    expect(messages).toEqual([
      '[ElectronTrace] backend connection.open connected=true user=user-1',
      '[ElectronTrace] renderer query.send turn=turn-1 conv=conv-1 text_len=20 resources=1 agent=true client_tools=0 disabled_tools=2 renderer_model=anthropic/claude-sonnet-4.5 prepared_model=anthropic/claude-sonnet-4.5 sdk_model=- model_dropped=true',
      '[ElectronTrace] sdk runtime.send turn=turn-1 conv=conv-1 text_len=20 resources=1 agent=true client_tools=0 disabled_tools=2 remote_tools=0',
      '[ElectronTrace] settings update.send source=renderer id=settings-1 keys=model_provider,selected_model_id provider=openai model=gpt-4.1 mode=- tools_mode=-',
      '[ElectronTrace] settings update.ack id=settings-1 success=true',
    ]);
    expect(JSON.stringify(messages)).not.toContain('private user request');
    expect(JSON.stringify(messages)).not.toContain('private prompt');
    expect(JSON.stringify(messages)).not.toContain('private runtime prompt');
    expect(JSON.stringify(messages)).not.toContain('sk-secret');
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'connection.open',
      connected: true,
      hasUserId: true,
    }));
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'query.send',
      textLength: 20,
      resourceCount: 1,
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      hasAgentDefinition: true,
      agentDefinitionMode: 'default_plus_overrides',
      agentToolMode: 'explicit',
      clientManifestToolCount: 0,
      disabledToolCount: 2,
      enabledRemoteToolCount: 1,
      systemPromptMode: 'replace',
      rendererPayloadHasModel: true,
      rendererPayloadModelProvider: 'anthropic',
      rendererPayloadModelId: 'claude-sonnet-4.5',
      preparedPayloadHasModel: true,
      preparedPayloadModelProvider: 'anthropic',
      preparedPayloadModelId: 'claude-sonnet-4.5',
      sdkPayloadHasModel: false,
      sdkPayloadModelProvider: null,
      sdkPayloadModelId: null,
      modelDroppedBeforeSdk: true,
    }));
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'runtime.send',
      phase: 'sdk',
      textLength: 20,
      resourceCount: 1,
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      hasAgentDefinition: true,
      agentDefinitionMode: 'default_plus_overrides',
      agentToolMode: 'explicit',
      clientManifestToolCount: 0,
      disabledToolCount: 2,
      enabledRemoteToolCount: 0,
      systemPromptMode: 'replace',
    }));
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'settings.update.send',
      updatedKeys: 'model_provider,selected_model_id',
      provider: 'openai',
      model: 'gpt-4.1',
    }));
    expect(JSON.stringify(appendIpcBridgeDiagnostic.mock.calls)).not.toContain('private user request');
    expect(JSON.stringify(appendIpcBridgeDiagnostic.mock.calls)).not.toContain('private runtime prompt');
    expect(JSON.stringify(appendIpcBridgeDiagnostic.mock.calls)).not.toContain('sk-secret');
  });

  test('ignores removed renderer query trace id fallbacks', () => {
    const messages = [];
    const appendIpcBridgeDiagnostic = jest.fn();
    const tracer = createElectronMainTraceLogger({
      log: message => messages.push(message),
      appendIpcBridgeDiagnostic,
      stdoutEnabled: true,
    });

    tracer.traceRendererQuery({
      turnRef: 'turn-legacy',
      payload: {
        text: 'private user request',
        turn_ref: 'turn-backend',
        conversation_ref: 'conv-backend',
        resources: [{ kind: 'screenshot' }],
      },
    });

    expect(messages).toEqual([
      '[ElectronTrace] renderer query.send turn=- conv=- text_len=20 resources=1 agent=false client_tools=0 disabled_tools=0 renderer_model=- prepared_model=- sdk_model=- model_dropped=false',
    ]);
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'query.send',
      conversationRef: null,
      turnRef: null,
      requestId: null,
      textLength: 20,
      resourceCount: 1,
    }));
    expect(JSON.stringify(messages)).not.toContain('private user request');
  });

  test('ignores removed camelCase backend event trace aliases', () => {
    const messages = [];
    const appendIpcBridgeDiagnostic = jest.fn();
    const tracer = createElectronMainTraceLogger({
      log: message => messages.push(message),
      appendIpcBridgeDiagnostic,
      stdoutEnabled: true,
    });

    tracer.traceBackendEvent({
      type: 'tool-call',
      turnRef: 'turn-camel',
      conversationRef: 'conv-camel',
      payload: {
        requestId: 'req-camel',
        correlationId: 'corr-camel',
        toolName: 'run_shell_command',
      },
    });
    tracer.traceBackendEvent({
      type: 'streaming-complete',
      payload: {
        turnRef: 'turn-payload-camel',
        conversationRef: 'conv-payload-camel',
        finalResponse: 'private camel final',
      },
    });

    expect(messages).toEqual([
      '[ElectronTrace] backend tool_call type=tool-call turn=- conv=- request=- tool=- text_len=0 final_len=0 content_len=0 success=-',
      '[ElectronTrace] backend complete type=streaming-complete turn=- conv=- request=- tool=- text_len=0 final_len=0 content_len=0 success=-',
    ]);
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'tool_call',
      requestId: null,
      conversationRef: null,
      turnRef: null,
      toolName: null,
    }));
    expect(appendIpcBridgeDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      action: 'complete',
      conversationRef: null,
      turnRef: null,
      finalLength: 0,
    }));
    expect(JSON.stringify(messages)).not.toContain('private camel final');
  });

  test('logs current-turn projection start, assistant progress, and completion', () => {
    const messages = [];
    const tracer = createCurrentTurnTraceLogger({
      log: message => messages.push(message),
    });

    tracer.trace({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'awaiting',
      assistantText: '',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    });
    tracer.trace({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'Hello',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    });
    tracer.trace({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'Hello there',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    });
    tracer.trace({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'complete',
      assistantText: 'Hello there',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    });

    expect(messages).toEqual([
      '[AssistantTrace][sdk] turn projection opened phase=awaiting turn=turn-1 conv=conv-1 assistant_len=0 reasoning_len=0 tool_events=0',
      '[AssistantTrace][sdk] assistant response started phase=streaming turn=turn-1 conv=conv-1 assistant_len=5 reasoning_len=0 tool_events=0',
      '[AssistantTrace][sdk] phase changed from=awaiting to=streaming phase=streaming turn=turn-1 conv=conv-1 assistant_len=5 reasoning_len=0 tool_events=0',
      '[AssistantTrace][sdk] assistant text advanced delta_len=6 phase=streaming turn=turn-1 conv=conv-1 assistant_len=11 reasoning_len=0 tool_events=0',
      '[AssistantTrace][sdk] phase changed from=streaming to=complete phase=complete turn=turn-1 conv=conv-1 assistant_len=11 reasoning_len=0 tool_events=0',
      '[AssistantTrace][sdk] assistant complete phase=complete turn=turn-1 conv=conv-1 assistant_len=11 reasoning_len=0 tool_events=0',
    ]);
  });

  test('ignores removed snake_case current-turn trace aliases', () => {
    const messages = [];
    const tracer = createCurrentTurnTraceLogger({
      log: message => messages.push(message),
    });

    tracer.trace({
      conversation_ref: 'conv-snake',
      turn_ref: 'turn-snake',
      phase: 'streaming',
      assistantText: 'Hello',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    });

    expect(messages).toEqual([
      '[AssistantTrace][sdk] turn projection opened phase=streaming turn=- conv=- assistant_len=5 reasoning_len=0 tool_events=0',
      '[AssistantTrace][sdk] assistant response started phase=streaming turn=- conv=- assistant_len=5 reasoning_len=0 tool_events=0',
    ]);
  });
});
