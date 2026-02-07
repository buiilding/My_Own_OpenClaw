import { act, renderHook } from '@testing-library/react';
import { IpcBridge, ON_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useChatStream } from '../../frontend/src/renderer/features/chat/hooks/useChatStream';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { recordToolMessage } from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';

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
  recordUserMessage: jest.fn(),
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
    });
  });

  test('clears thinking status on streaming response', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({ thinkingStatus: 'thinking' });
      emitBackendEvent({
        type: 'streaming-response',
        payload: { text: 'hi' },
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
          completion_tokens: 5,
          total_tokens: 17,
        },
      });
    });

    expect(useChatStore.getState().tokenCounts).toEqual({
      prompt_tokens: 12,
      completion_tokens: 5,
      total_tokens: 17,
    });
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
});
