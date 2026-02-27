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

  test('clears compacting status when context compaction completes', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: 'Compacting conversation history...' });
      emitBackendEvent({
        type: 'context-compaction-completed',
        payload: { reason: 'auto-pre', strategy: 'inline' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBeNull();
  });

  test('clears compacting status when context compaction fails', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: 'Compacting conversation history...' });
      emitBackendEvent({
        type: 'context-compaction-failed',
        payload: { reason: 'auto-pre', strategy: 'inline', error: 'boom' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBeNull();
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
