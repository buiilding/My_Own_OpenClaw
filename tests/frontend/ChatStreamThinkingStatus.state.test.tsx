import { act } from '@testing-library/react';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  registerBackendListener,
  resetChatStreamTestState,
  setMockConfig,
} from './ChatStreamThinkingStatus.testUtils';

describe('useChatStream state + stream handling', () => {
  beforeEach(() => {
    resetChatStreamTestState();
  });

  test('preserves thinking status on streaming response chunks', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: 'thinking' });
      emitBackendEvent({
        type: 'streaming-response',
        payload: { text: 'hi' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBe('thinking');
  });

  test('updates thinking status from llm-thought events', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: null });
      emitBackendEvent({
        type: 'llm-thought',
        payload: { status: 'thinking...' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toContain('thinking');
  });

  test('ignores stale llm-thought event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-new-turn',
            text: '',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
            thinkingText: 'current step',
            thinkingSourceEventType: 'llm-thought',
          },
        ],
        thinkingStatus: 'current step',
        thinkingSourceEventType: 'llm-thought',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'llm-thought',
        turn_ref: 'turn-old',
        payload: { status: 'stale step' },
      });
    });

    const state = useChatStore.getState();
    expect(state.thinkingStatus).toBe('current step');
    expect(state.thinkingSourceEventType).toBe('llm-thought');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        turnRef: 'turn-new',
        thinkingText: 'current step',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
      }),
    );
  });

  test('creates assistant placeholder with live thinking before first text chunk', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ messages: [] });
      emitBackendEvent({
        type: 'llm-thought',
        turn_ref: 'turn-live',
        payload: { status: 'drafting plan' },
      });
    });

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(expect.objectContaining({
      sender: 'assistant',
      type: 'llm-text',
      turnRef: 'turn-live',
      text: '',
      thinkingText: 'drafting plan',
      thinkingSourceEventType: 'llm-thought',
    }));
  });

  test('appends streaming response text to same assistant message that holds live thinking', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ messages: [] });
      emitBackendEvent({
        type: 'llm-thought',
        turn_ref: 'turn-live',
        payload: { status: 'step 1' },
      });
      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-live',
        payload: { text: 'Final answer' },
      });
    });

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(expect.objectContaining({
      sender: 'assistant',
      type: 'llm-text',
      turnRef: 'turn-live',
      text: 'Final answer',
      thinkingText: 'step 1',
    }));
  });

  test('accepts llm-thought payload content fallback', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: null });
      emitBackendEvent({
        type: 'llm-thought',
        payload: { content: 'reasoning step' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toContain('reasoning step');
  });

  test('shows compacting status while context compaction is running', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: null });
      emitBackendEvent({
        type: 'context-compaction-started',
        payload: { reason: 'auto-pre', strategy: 'inline' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBe('Compacting conversation history...');
  });

  test('replaces compacting status with compacted status when context compaction completes', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: 'Compacting conversation history...' });
      emitBackendEvent({
        type: 'context-compaction-completed',
        payload: { reason: 'auto-pre', strategy: 'inline' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBe('Conversation history compacted.');
    expect(useChatStore.getState().thinkingSourceEventType).toBe('context-compaction-completed');
  });

  test('shows completed-no-changes status when compaction completes with skipped_reason', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: 'Compacting conversation history...' });
      emitBackendEvent({
        type: 'context-compaction-completed',
        payload: { reason: 'manual', strategy: 'inline', skipped_reason: 'below-threshold' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBe('Compaction completed (no changes needed).');
    expect(useChatStore.getState().thinkingSourceEventType).toBe('context-compaction-completed');
  });

  test('replaces compacting status with failure status when context compaction fails', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: 'Compacting conversation history...' });
      emitBackendEvent({
        type: 'context-compaction-failed',
        payload: { reason: 'auto-pre', strategy: 'inline', error: 'boom' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBe('boom');
    expect(useChatStore.getState().thinkingSourceEventType).toBe('context-compaction-failed');
  });

  test('ignores stale context-compaction lifecycle events for old turns', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        thinkingStatus: 'current thinking',
        thinkingSourceEventType: 'llm-thought',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'context-compaction-started',
        turn_ref: 'turn-old',
        payload: { reason: 'manual', strategy: 'inline' },
      });
      emitBackendEvent({
        type: 'context-compaction-completed',
        turn_ref: 'turn-old',
        payload: { reason: 'manual', strategy: 'inline' },
      });
      emitBackendEvent({
        type: 'context-compaction-failed',
        turn_ref: 'turn-old',
        payload: { reason: 'manual', strategy: 'inline', error: 'stale' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBe('current thinking');
    expect(useChatStore.getState().thinkingSourceEventType).toBe('llm-thought');
    expect(useChatStore.getState().streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
      }),
    );
  });

  test('clears thinking status on tool call', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: 'thinking' });
      emitBackendEvent({
        type: 'tool-call',
        payload: { tool_name: 'screenshot', parameters: {} },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBeNull();
  });

  test('clears sending state on tool output so awaiting dot cannot stick', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        isSending: true,
        thinkingStatus: 'thinking',
      });
      emitBackendEvent({
        type: 'tool-output',
        payload: {
          tool_name: 'screenshot',
          output: 'ok',
        },
      });
    });

    const state = useChatStore.getState();
    expect(state.isSending).toBe(false);
    expect(state.thinkingStatus).toBeNull();
  });

  test('ignores stale tool-call event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'tool-call',
        turn_ref: 'turn-old',
        payload: { tool_name: 'screenshot', parameters: {} },
      });
    });

    const state = useChatStore.getState();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        turnRef: 'turn-new',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
        toolCallCount: 0,
      }),
    );
  });

  test('ignores stale tool-output event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'tool-output',
        turn_ref: 'turn-old',
        payload: {
          tool_name: 'screenshot',
          output: 'stale output',
        },
      });
    });

    const state = useChatStore.getState();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        turnRef: 'turn-new',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
        toolOutputCount: 0,
      }),
    );
  });

  test('ignores stale tool-bundle event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'tool-bundle',
        turn_ref: 'turn-old',
        payload: {
          bundle_id: 'bundle-old',
          tools: [{ name: 'screenshot', args: {} }],
        },
      });
    });

    const state = useChatStore.getState();
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        turnRef: 'turn-new',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
        toolCallCount: 0,
      }),
    );
  });

  test('clears thinking status on streaming complete', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: 'thinking' });
      emitBackendEvent({
        type: 'streaming-complete',
        payload: {},
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBeNull();
  });

  test('ignores stale streaming-complete turn when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'streaming-complete',
        turn_ref: 'turn-old',
        payload: {},
      });
    });

    const state = useChatStore.getState();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
      }),
    );
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        isComplete: false,
      }),
    );
  });

  test('persists streamed thinking text onto completed assistant message', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-turn-1',
            text: 'final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-1',
          },
        ],
        thinkingStatus: 'step 1\nstep 2',
        thinkingSourceEventType: 'llm-thought',
      });
      emitBackendEvent({
        type: 'streaming-complete',
        turn_ref: 'turn-1',
        payload: {},
      });
    });

    const message = useChatStore.getState().messages[0];
    expect(message.thinkingText).toBe('step 1\nstep 2');
    expect(message.thinkingSourceEventType).toBe('llm-thought');
    expect(useChatStore.getState().thinkingStatus).toBeNull();
  });

  test('adds local user message to store', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        payload: { text: 'hello from chatbox', screenshot: null },
      });
    });

    const messages = useChatStore.getState().messages;
    const last = messages[messages.length - 1];
    expect(last.sender).toBe('user');
    expect(last.text).toBe('hello from chatbox');
    expect(useChatStore.getState().isSending).toBe(true);
  });

  test('does not set generic thinking status for gemini when thought-text streaming is supported', () => {
    setMockConfig({
      selected_model_id: 'gemini-3.1-pro-preview',
      model_provider: 'gemini',
    });
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        payload: { text: 'hello from chatbox', screenshot: null },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBeNull();
  });

  test('shows generic thinking status for models explicitly marked without thought-text stream', () => {
    setMockConfig(
      {
        selected_model_id: 'gemini-3.1-pro-preview',
        model_provider: 'gemini',
      },
      {
        local: [],
        online: [
          {
            id: 'gemini-3.1-pro-preview',
            provider: 'gemini',
            supports_thinking: true,
            supports_thinking_text_stream: false,
          },
        ],
      },
    );
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        payload: { text: 'hello from chatbox', screenshot: null },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBe('Thinking...');
  });

  test('replaces generic thinking fallback when llm-thought chunks arrive', () => {
    setMockConfig({
      selected_model_id: 'gemini-3.1-pro-preview',
      model_provider: 'gemini',
    });
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        payload: { text: 'hello from chatbox', screenshot: null },
      });
      emitBackendEvent({
        type: 'llm-thought',
        payload: { status: 'reasoning chunk' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBe('reasoning chunk');
  });

  test('tracks memory-store events for the active turn', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        streamTracking: {
          activeTurnRef: 'turn-1',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'memory-store',
        turn_ref: 'turn-1',
        payload: { status: 'stored' },
      });
    });

    expect(useChatStore.getState().streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-1',
        phase: 'streaming',
        lastEventType: 'memory-store',
        eventCount: 3,
      }),
    );
  });

  test('ignores stale memory-store event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'memory-store',
        turn_ref: 'turn-old',
        payload: { status: 'stored' },
      });
    });

    expect(useChatStore.getState().streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        lastEventType: 'streaming-response',
        eventCount: 2,
      }),
    );
  });

  test('updates token counts from token-count events', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'token-count',
        payload: {
          prompt_tokens: 12,
          visible_output_tokens: 3,
          thinking_tokens: 2,
          output_tokens_total: 5,
          total_tokens: 17,
          conversation_tokens: 120,
          usage_source: 'provider',
        },
      });
    });

    expect(useChatStore.getState().tokenCounts).toEqual({
      prompt_tokens: 12,
      visible_output_tokens: 3,
      thinking_tokens: 2,
      output_tokens_total: 5,
      total_tokens: 17,
      conversation_tokens: 120,
      usage_source: 'provider',
    });
  });

  test('attaches provider token counts to the completed assistant message for the same turn', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-1',
            text: 'Final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            turnRef: 'turn-provider',
            sourceEventType: 'streaming-complete',
            sourceChannel: 'from-backend',
          },
        ],
      });

      emitBackendEvent({
        type: 'token-count',
        turn_ref: 'turn-provider',
        payload: {
          prompt_tokens: 12,
          visible_output_tokens: 3,
          thinking_tokens: 2,
          output_tokens_total: 5,
          total_tokens: 17,
          conversation_tokens: 120,
          usage_source: 'provider',
        },
      });
    });

    expect(useChatStore.getState().messages[0]).toEqual(expect.objectContaining({
      tokenCounts: {
        prompt_tokens: 12,
        visible_output_tokens: 3,
        thinking_tokens: 2,
        output_tokens_total: 5,
        total_tokens: 17,
        conversation_tokens: 120,
        usage_source: 'provider',
      },
    }));
  });

  test('ignores stale token-count event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        tokenCounts: {
          prompt_tokens: 5,
          visible_output_tokens: 2,
          output_tokens_total: 2,
          total_tokens: 7,
          conversation_tokens: 70,
          usage_source: 'provider',
        },
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'token-count',
        turn_ref: 'turn-old',
        payload: {
          prompt_tokens: 99,
          visible_output_tokens: 99,
          output_tokens_total: 99,
          total_tokens: 198,
          conversation_tokens: 198,
          usage_source: 'provider',
        },
      });
    });

    expect(useChatStore.getState().tokenCounts).toEqual({
      prompt_tokens: 5,
      visible_output_tokens: 2,
      output_tokens_total: 2,
      total_tokens: 7,
      conversation_tokens: 70,
      usage_source: 'provider',
    });
  });

  test('appends text to last incomplete assistant streaming message', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-1',
            text: 'hello',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
          },
        ],
      });
      emitBackendEvent({
        type: 'streaming-response',
        payload: { text: ' world' },
      });
    });

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        text: 'hello world',
        type: 'llm-text',
      }),
    ]);
  });

  test('creates new assistant message when last message is complete', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-1',
            text: 'existing',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
          },
        ],
      });
      emitBackendEvent({
        type: 'streaming-response',
        payload: { text: 'new chunk' },
      });
    });

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        text: 'new chunk',
        type: 'llm-text',
        isComplete: false,
      }),
    );
  });

  test('ignores stale streaming-response event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'new answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 10,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-old',
        payload: { text: 'stale chunk' },
      });
    });

    const state = useChatStore.getState();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        text: 'new answer',
        turnRef: 'turn-new',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
        chunkCount: 1,
      }),
    );
  });

  test('accepts next-turn first chunk after local send when previous turn is terminal', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-old',
            text: 'old final answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: true,
            turnRef: 'turn-old',
          },
          {
            id: 'user-new',
            text: 'follow up',
            sender: 'user',
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        streamTracking: {
          activeTurnRef: 'turn-old',
          phase: 'complete',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: '2026-03-05T00:00:03.000Z',
          lastEventAt: '2026-03-05T00:00:03.000Z',
          lastEventType: 'streaming-complete',
          eventCount: 3,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 14,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-new',
        payload: { text: 'next answer' },
      });
    });

    const state = useChatStore.getState();
    expect(state.isSending).toBe(false);
    expect(state.messages.at(-1)).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        type: 'llm-text',
        text: 'next answer',
        turnRef: 'turn-new',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
      }),
    );
  });

  test('ignores benign settings update errors', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        isSending: true,
        thinkingStatus: 'thinking',
        messages: [{ id: 'init', text: 'Hello!', sender: 'assistant' }],
      });
    });

    act(() => {
      emitBackendEvent({
        type: 'error',
        payload: {
          message: 'Failed to update settings: timeout',
        },
      });
    });

    expect(useChatStore.getState().isSending).toBe(true);
    expect(useChatStore.getState().thinkingStatus).toBe('thinking');
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  test('suppresses recoverable streamed tool-call parse errors in chat banner', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        isSending: true,
        thinkingStatus: 'thinking',
        messages: [{ id: 'init', text: 'Hello!', sender: 'assistant' }],
      });
    });

    act(() => {
      emitBackendEvent({
        type: 'error',
        payload: {
          content: (
            'Unexpected system error: Invalid response from stream: '
            + 'failed to parse streamed tool-call arguments for id=tool_bad name=run_shell_command. '
            + 'Raw arguments preview: \'{"command":"cat > index.html << \\"EOF\\""}\''
          ),
        },
      });
    });

    expect(useChatStore.getState().isSending).toBe(true);
    expect(useChatStore.getState().thinkingStatus).toBe('thinking');
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  test('handles real errors even when error text is in payload content', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({ isSending: true, thinkingStatus: 'thinking' });
    });

    act(() => {
      emitBackendEvent({
        type: 'error',
        payload: {
          content: 'Gateway request failed',
        },
      });
    });

    const state = useChatStore.getState();
    expect(state.isSending).toBe(false);
    expect(state.thinkingStatus).toBe('');
    expect(state.messages.at(-1)).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        type: 'error',
        text: 'Gateway request failed',
      }),
    );
  });

  test('ignores stale error event when a newer active turn is in progress', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          {
            id: 'assistant-new-turn',
            text: 'working',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-new',
          },
        ],
        isSending: true,
        thinkingStatus: 'thinking',
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 7,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'error',
        turn_ref: 'turn-old',
        payload: { message: 'stale failure' },
      });
    });

    const state = useChatStore.getState();
    expect(state.isSending).toBe(true);
    expect(state.thinkingStatus).toBe('thinking');
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-new-turn',
        type: 'llm-text',
      }),
    );
    expect(state.streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-new',
        phase: 'streaming',
        eventCount: 2,
      }),
    );
  });

  test('ignores local-user-message when text is missing', () => {
    const { emitBackendEvent } = registerBackendListener();
    const before = useChatStore.getState().messages.length;

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        payload: { text: '' },
      });
    });

    expect(useChatStore.getState().messages).toHaveLength(before);
  });

  test('does not append chunk to non-contiguous older llm-text for same turn_ref', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'old', turnRef: 'turn-old' },
          {
            id: 'assistant-old',
            sender: 'assistant',
            text: 'old answer',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-old',
          },
          { id: 'user-2', sender: 'user', text: 'new', turnRef: 'turn-new' },
        ],
      });

      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-old',
        payload: { text: ' +next' },
      });
    });

    const messages = useChatStore.getState().messages;
    const assistantOld = messages.find((message) => message.id === 'assistant-old');
    expect(assistantOld).toEqual(expect.objectContaining({ text: 'old answer' }));
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        type: 'llm-text',
        text: ' +next',
        turnRef: 'turn-old',
      }),
    );
  });

  test('creates a new llm-text message when latest turn message is tool output', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'check', turnRef: 'turn-1' },
          {
            id: 'assistant-preface',
            sender: 'assistant',
            text: 'I will check that.',
            type: 'llm-text',
            isComplete: false,
            turnRef: 'turn-1',
          },
          {
            id: 'tool-output-1',
            sender: 'assistant',
            text: 'tool output',
            type: 'tool-output',
            turnRef: 'turn-1',
          },
        ],
      });

      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-1',
        payload: { text: 'Here is the final answer.' },
      });
    });

    const messages = useChatStore.getState().messages;
    const preface = messages.find((message) => message.id === 'assistant-preface');
    expect(preface).toEqual(expect.objectContaining({ text: 'I will check that.' }));
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        type: 'llm-text',
        text: 'Here is the final answer.',
        turnRef: 'turn-1',
      }),
    );
  });

  test('tracks stream lifecycle fields across local-user-message and chunks', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        turn_ref: 'turn-123',
        payload: { text: 'hello' },
      });
      emitBackendEvent({
        type: 'streaming-response',
        turn_ref: 'turn-123',
        payload: { text: 'chunk' },
      });
      emitBackendEvent({
        type: 'streaming-complete',
        turn_ref: 'turn-123',
        payload: {},
      });
    });

    expect(useChatStore.getState().streamTracking).toEqual(
      expect.objectContaining({
        activeTurnRef: 'turn-123',
        phase: 'complete',
        chunkCount: 1,
        eventCount: 3,
      }),
    );
  });
});
