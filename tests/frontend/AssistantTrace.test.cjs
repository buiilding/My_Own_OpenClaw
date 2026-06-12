/** @jest-environment node */

const {
  buildBackendAssistantTraceSummary,
  buildSettingsTraceSummary,
  createElectronMainTraceLogger,
  createCurrentTurnTraceLogger,
  shouldTraceAssistantBackendEvent,
  traceAssistantBackendEvent,
} = require('../../frontend/src/main/ipc/ipc_assistant_trace.cjs');

describe('assistant runtime trace logging', () => {
  test('recognizes assistant backend lifecycle events without tracing tool noise', () => {
    expect(shouldTraceAssistantBackendEvent({ type: 'streaming-response' })).toBe(true);
    expect(shouldTraceAssistantBackendEvent({ type: 'streaming-complete' })).toBe(true);
    expect(shouldTraceAssistantBackendEvent({ type: 'tool-call' })).toBe(false);
  });

  test('logs compact backend milestones once per turn without raw content', () => {
    const messages = [];
    const tracer = createElectronMainTraceLogger({
      log: message => messages.push(message),
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
  });

  test('logs frontend query, backend connection, and settings as compact lines', () => {
    const messages = [];
    const tracer = createElectronMainTraceLogger({
      log: message => messages.push(message),
    });

    tracer.traceBackendConnection({
      type: 'open',
      handshake: { user_id: 'user-1' },
    });
    tracer.traceFrontendQuery({
      queryMessageId: 'turn-1',
      conversationRef: 'conv-1',
      payload: {
        text: 'private user request',
        resources: [{ kind: 'screenshot' }],
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
      '[ElectronTrace] frontend query.send turn=turn-1 conv=conv-1 text_len=20 resources=1',
      '[ElectronTrace] settings update.send source=renderer id=settings-1 keys=model_provider,selected_model_id provider=openai model=gpt-4.1 mode=- tools_mode=-',
      '[ElectronTrace] settings update.ack id=settings-1 success=true',
    ]);
    expect(JSON.stringify(messages)).not.toContain('private user request');
    expect(JSON.stringify(messages)).not.toContain('sk-secret');
  });

  test('summarizes settings changes without provider secrets', () => {
    const summary = buildSettingsTraceSummary({
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet',
      provider_api_keys: { anthropic: { api_key: 'secret-key' } },
      tools: { mode: 'auto' },
    }, 'initial-sync', 'settings-2');

    expect(summary).toBe(
      'source=initial-sync id=settings-2 keys=model_provider,selected_model_id,tools provider=anthropic model=claude-sonnet mode=- tools_mode=auto',
    );
    expect(summary).not.toContain('secret-key');
    expect(summary).not.toContain('provider_api_keys');
  });

  test('summarizes backend assistant events without logging raw text content', () => {
    const summary = buildBackendAssistantTraceSummary({
      type: 'streaming-response',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: {
        text: 'private assistant text',
      },
    });

    expect(summary).toBe(
      'type=streaming-response turn=turn-1 conv=conv-1 text_len=22 final_len=0 content_len=0',
    );
    expect(summary).not.toContain('private assistant text');
  });

  test('logs backend assistant response and completion milestones', () => {
    const messages = [];
    const log = message => messages.push(message);

    expect(traceAssistantBackendEvent({
      type: 'streaming-response',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: { text: 'hello' },
    }, { log })).toBe(true);
    expect(traceAssistantBackendEvent({
      type: 'streaming-complete',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: { final_response: 'hello there' },
    }, { log })).toBe(true);
    expect(traceAssistantBackendEvent({
      type: 'tool-call',
      turn_ref: 'turn-1',
      conversation_ref: 'conv-1',
      payload: {},
    }, { log })).toBe(false);

    expect(messages).toEqual([
      '[AssistantTrace][backend] assistant chunk received type=streaming-response turn=turn-1 conv=conv-1 text_len=5 final_len=0 content_len=0',
      '[AssistantTrace][backend] assistant complete received type=streaming-complete turn=turn-1 conv=conv-1 text_len=0 final_len=11 content_len=0',
    ]);
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
});
