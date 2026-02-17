import { act, renderHook } from '@testing-library/react';
import { IpcBridge, ON_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useChatStream } from '../../frontend/src/renderer/features/chat/hooks/useChatStream';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { recordToolMessage } from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';
import {
  recordAssistantMessage,
  updateTranscriptSession,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';

let mockConfig = {
  selected_model_id: 'test-model',
  model_provider: 'test-provider',
};
const mockUseAppConfigContext = jest.fn(() => ({ config: mockConfig }));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => mockUseAppConfigContext(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  recordAssistantMessage: jest.fn(),
  recordToolMessage: jest.fn(),
  updateTranscriptSession: jest.fn(),
}));

describe('useChatStream', () => {
  const registerBackendListener = () => {
    const handlers: Record<string, (data: unknown) => void> = {};
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      handlers[channel] = handler;
      return () => {};
    });

    renderHook(() => useChatStream());

    const emitBackendEvent = (event: unknown) => {
      const backendHandler = handlers[ON_CHANNELS.FROM_BACKEND];
      expect(backendHandler).toEqual(expect.any(Function));
      backendHandler(event);
    };

    return { emitBackendEvent };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      selected_model_id: 'test-model',
      model_provider: 'test-provider',
    };
    mockUseAppConfigContext.mockReturnValue({ config: mockConfig });
    useChatStore.setState({
      messages: [
        {
          id: 'init',
          text: 'Hello!',
          sender: 'assistant',
        },
      ],
      isSending: false,
      thinkingStatus: null,
      tokenCounts: null,
      streamTracking: {
        activeTurnRef: null,
        phase: 'idle',
        startedAt: null,
        firstChunkAt: null,
        completedAt: null,
        lastEventAt: null,
        lastEventType: null,
        eventCount: 0,
        chunkCount: 0,
        toolCallCount: 0,
        toolOutputCount: 0,
        lastChunkSize: 0,
        lastError: null,
      },
    });
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

  test('uses latest model metadata without re-subscribing backend listener', () => {
    const handlers: Record<string, (data: unknown) => void> = {};
    const removeListener = jest.fn();
    const onSpy = jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      handlers[channel] = handler;
      return removeListener;
    });

    const { rerender } = renderHook(
      ({ enableTranscript }) => useChatStream(enableTranscript),
      { initialProps: { enableTranscript: true } },
    );

    expect(onSpy).toHaveBeenCalledTimes(1);

    mockConfig = {
      selected_model_id: 'updated-model',
      model_provider: 'updated-provider',
    };
    mockUseAppConfigContext.mockReturnValue({ config: mockConfig });
    rerender({ enableTranscript: true });

    expect(onSpy).toHaveBeenCalledTimes(1);

    const backendHandler = handlers[ON_CHANNELS.FROM_BACKEND];
    expect(backendHandler).toEqual(expect.any(Function));
    act(() => {
      backendHandler({
        type: 'tool-call',
        session_id: 'session-1',
        user_id: 'user-1',
        payload: {
          tool_name: 'read_file',
          parameters: { file_path: '/tmp/a' },
        },
      });
    });

    expect(recordToolMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        modelId: 'updated-model',
        modelProvider: 'updated-provider',
      }),
    );
  });

  test('writes tool-output transcript with correlation fallback from metadata', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'tool-output',
        id: 'event-1',
        session_id: 'session-1',
        user_id: 'user-1',
        payload: {
          tool_name: 'read_file',
          success: true,
          output: 'done',
          metadata: { request_id: 'meta-corr' },
        },
      });
    });

    const last = useChatStore.getState().messages.at(-1);
    expect(last).toEqual(
      expect.objectContaining({
        type: 'tool-output',
        correlationId: 'meta-corr',
      }),
    );
    expect(recordToolMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        correlationId: 'meta-corr',
      }),
    );
  });

  test('streaming-complete marks assistant message complete and records transcript', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', text: 'hi', sender: 'user' },
          {
            id: 'assistant-1',
            text: 'answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
          },
        ],
      });
      emitBackendEvent({
        type: 'streaming-complete',
        conversation_ref: 'conv-1',
        user_id: 'user-1',
      });
    });

    expect(useChatStore.getState().messages.at(-1)).toEqual(
      expect.objectContaining({ id: 'assistant-1', isComplete: true }),
    );
    expect(recordAssistantMessage).toHaveBeenCalledWith(
      'answer',
      expect.objectContaining({
        conversationRef: 'conv-1',
        userId: 'user-1',
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

  test('does not write transcript entries when transcript is disabled', () => {
    const handlers: Record<string, (data: unknown) => void> = {};
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      handlers[channel] = handler;
      return () => {};
    });
    renderHook(() => useChatStream(false));

    const backendHandler = handlers[ON_CHANNELS.FROM_BACKEND];
    expect(backendHandler).toEqual(expect.any(Function));
    act(() => {
      backendHandler({
        type: 'tool-call',
        session_id: 'session-1',
        user_id: 'user-1',
        payload: { tool_name: 'read_file', parameters: { file_path: '/tmp/a' } },
      });
    });

    expect(recordToolMessage).not.toHaveBeenCalled();
    expect(updateTranscriptSession).not.toHaveBeenCalled();
  });

  test('handles tool-bundle events and records transcript metadata', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'tool-bundle',
        session_id: 'session-1',
        user_id: 'user-1',
        payload: {
          bundle_id: 'bundle-1',
          tools: [{ name: 'read_file', args: { file_path: '/tmp/a' } }],
        },
      });
    });

    const last = useChatStore.getState().messages.at(-1);
    expect(last).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        type: 'tool-call',
      }),
    );
    expect(recordToolMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        messageType: 'tool-call',
        toolName: 'tool-bundle',
        correlationId: 'bundle-1',
      }),
    );
  });

  test('system-prompt event updates last user message metadata', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'ask' },
          { id: 'assistant-1', sender: 'assistant', text: 'reply' },
        ],
      });
      emitBackendEvent({
        type: 'system-prompt',
        payload: {
          content: 'prompt text',
          tool_schemas: [{ type: 'function', function: { name: 'tool-a', parameters: { type: 'object' } } }],
        },
      });
    });

    const userMessage = useChatStore.getState().messages[0];
    expect(userMessage.systemPrompt).toEqual({
      content: 'prompt text',
      toolSchemas: [{ type: 'function', function: { name: 'tool-a', parameters: { type: 'object' } } }],
    });
  });

  test('full-message events enrich existing user and assistant messages', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'ask', turnRef: 'turn-1' },
          { id: 'assistant-1', sender: 'assistant', text: 'reply', type: 'llm-text', turnRef: 'turn-1' },
        ],
      });
      emitBackendEvent({
        type: 'user-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'raw user', metadata: { a: 1 } },
      });
      emitBackendEvent({
        type: 'assistant-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'raw assistant' },
      });
    });

    const [userMessage, assistantMessage] = useChatStore.getState().messages;
    expect(userMessage.fullUserMessage).toEqual({
      content: 'raw user',
      metadata: { a: 1 },
    });
    expect(assistantMessage.fullAssistantMessage).toEqual({
      content: 'raw assistant',
    });
  });

  test('user-message-full falls back to latest user message when turn_ref has no match', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'ask without turn ref' },
          { id: 'assistant-1', sender: 'assistant', text: 'reply', type: 'llm-text', turnRef: 'turn-1' },
        ],
      });
      emitBackendEvent({
        type: 'user-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'raw user fallback', metadata: { a: 1 } },
      });
    });

    const userMessage = useChatStore.getState().messages[0];
    expect(userMessage.fullUserMessage).toEqual({
      content: 'raw user fallback',
      metadata: { a: 1 },
    });
  });

  test('tool-schemas event updates first user message', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'first user' },
          { id: 'assistant-1', sender: 'assistant', text: 'assistant' },
          { id: 'user-2', sender: 'user', text: 'second user' },
        ],
      });
      emitBackendEvent({
        type: 'tool-schemas',
        payload: {
          tool_schemas: [{ type: 'function', function: { name: 'tool-x', parameters: { type: 'object' } } }],
        },
      });
    });

    expect(useChatStore.getState().messages[0].toolSchemas).toEqual([
      { type: 'function', function: { name: 'tool-x', parameters: { type: 'object' } } },
    ]);
    expect(useChatStore.getState().messages[2].toolSchemas).toBeUndefined();
  });

  test('ignores non-backend events entirely', () => {
    const handlers: Record<string, (data: unknown) => void> = {};
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      handlers[channel] = handler;
      return () => {};
    });
    renderHook(() => useChatStream(true));

    const backendHandler = handlers[ON_CHANNELS.FROM_BACKEND];
    expect(backendHandler).toEqual(expect.any(Function));
    act(() => {
      backendHandler({ type: 'not-a-real-event' });
    });

    expect(updateTranscriptSession).not.toHaveBeenCalled();
  });

  test('updates transcript session on each valid backend event when enabled', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'token-count',
        conversation_ref: 'conv-2',
        user_id: 'user-2',
        payload: {
          prompt_tokens: 2,
          visible_output_tokens: 2,
          thinking_tokens: 1,
          output_tokens_total: 3,
          total_tokens: 5,
          conversation_tokens: 5,
          usage_source: 'provider',
        },
      });
    });

    expect(updateTranscriptSession).toHaveBeenCalledWith('conv-2', 'user-2');
  });

  test('preserves transcript session refs when backend event omits conversation and user ids', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'tool-schemas',
        payload: {
          tool_schemas: [{ type: 'function', function: { name: 'tool-x', parameters: { type: 'object' } } }],
        },
      });
    });

    expect(updateTranscriptSession).toHaveBeenCalledTimes(1);
    expect(updateTranscriptSession).toHaveBeenCalledWith(undefined, undefined);
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

  test('assistant-message-full does not attach to tool-output messages', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'check', turnRef: 'turn-1' },
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
        type: 'assistant-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'final text' },
      });
    });

    const toolOutput = useChatStore.getState().messages.find((message) => message.id === 'tool-output-1');
    expect(toolOutput?.fullAssistantMessage).toBeUndefined();
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
