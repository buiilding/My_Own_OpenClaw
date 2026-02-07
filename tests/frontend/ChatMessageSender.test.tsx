import { act, renderHook } from '@testing-library/react';
import { useChatMessageSender } from '../../frontend/src/renderer/features/chat/hooks/useChatMessageSender';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { extractOSstate } from '../../frontend/src/renderer/infrastructure/services/SystemCapture';
import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';

jest.mock('../../frontend/src/renderer/infrastructure/services/SystemCapture', () => ({
  extractOSstate: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    sendQuery: jest.fn(),
  },
}));

const mockExtractOSstate = extractOSstate as jest.MockedFunction<typeof extractOSstate>;
const mockSendQuery = ApiClient.sendQuery as jest.MockedFunction<typeof ApiClient.sendQuery>;

describe('useChatMessageSender', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isSending: false,
      thinkingStatus: null,
      tokenCounts: null,
    });

    (global as any).crypto = {
      randomUUID: jest.fn(() => 'msg-1'),
    };

    (window as any).ipc = {
      send: jest.fn(),
      invoke: jest.fn().mockResolvedValue({ success: true }),
      on: jest.fn(),
      once: jest.fn(),
    };

    mockExtractOSstate.mockResolvedValue({ systemState: null, screenshot: null });
    mockSendQuery.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete (window as any).ipc;
  });

  test('returns to chatbox without focus when configured', async () => {
    const { result } = renderHook(() =>
      useChatMessageSender(undefined, { returnToChatboxOnSend: true }),
    );

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect((window as any).ipc.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    );
  });

  test('marks first user message capture path on first send', async () => {
    const { result } = renderHook(() =>
      useChatMessageSender(undefined, { returnToChatboxOnSend: false }),
    );

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(mockExtractOSstate).toHaveBeenCalledWith(
      true,
      true,
      0,
      true,
    );
  });

  test('uses non-first capture path when user message already exists', async () => {
    useChatStore.setState({
      messages: [
        {
          id: 'existing-user',
          text: 'previous',
          sender: 'user',
        },
      ],
      isSending: false,
      thinkingStatus: null,
      tokenCounts: null,
    });

    const { result } = renderHook(() =>
      useChatMessageSender(undefined, { returnToChatboxOnSend: false }),
    );

    await act(async () => {
      await result.current.sendMessage('second');
    });

    expect(mockExtractOSstate).toHaveBeenCalledWith(
      true,
      true,
      0,
      false,
    );
  });
});
