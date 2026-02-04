import { act, renderHook } from '@testing-library/react';
import { IpcBridge, ON_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useChatStream } from '../../frontend/src/renderer/features/chat/hooks/useChatStream';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';

describe('useChatStream', () => {
  beforeEach(() => {
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
    const onHandlers = {};
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      onHandlers[channel] = handler;
      return () => {};
    });

    renderHook(() => useChatStream());

    act(() => {
      useChatStore.setState({ thinkingStatus: 'thinking' });
      onHandlers[ON_CHANNELS.FROM_BACKEND]({
        type: 'streaming-response',
        payload: { text: 'hi' },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBeNull();
  });

  test('clears thinking status on tool call', () => {
    const onHandlers = {};
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      onHandlers[channel] = handler;
      return () => {};
    });

    renderHook(() => useChatStream());

    act(() => {
      useChatStore.setState({ thinkingStatus: 'thinking' });
      onHandlers[ON_CHANNELS.FROM_BACKEND]({
        type: 'tool-call',
        payload: { tool_name: 'screenshot', parameters: {} },
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBeNull();
  });

  test('clears thinking status on streaming complete', () => {
    const onHandlers = {};
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
      onHandlers[channel] = handler;
      return () => {};
    });

    renderHook(() => useChatStream());

    act(() => {
      useChatStore.setState({ thinkingStatus: 'thinking' });
      onHandlers[ON_CHANNELS.FROM_BACKEND]({
        type: 'streaming-complete',
        payload: {},
      });
    });

    expect(useChatStore.getState().thinkingStatus).toBeNull();
  });
});
