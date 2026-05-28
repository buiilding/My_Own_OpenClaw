/** @jest-environment node */

const {
  buildBackendAssistantTraceSummary,
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
