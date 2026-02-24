import { act, renderHook } from '@testing-library/react';
import { useChatMessageSender } from '../../frontend/src/renderer/features/chat/hooks/useChatMessageSender';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { extractOSstate } from '../../frontend/src/renderer/infrastructure/services/SystemCapture';
import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';
import { uploadArtifactBase64 } from '../../frontend/src/renderer/infrastructure/services/ArtifactUploader';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  recordUserMessage,
  setActiveConversationRef,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';

let mockFrontendConfig: Record<string, unknown> = {
  include_query_screenshot: true,
};

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: jest.fn(() => ({
    config: mockFrontendConfig,
  })),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/SystemCapture', () => ({
  extractOSstate: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    sendQuery: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/ArtifactUploader', () => ({
  uploadArtifactBase64: jest.fn(),
}));

let mockActiveConversationRef: string | null = null;
jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getActiveConversationRef: jest.fn(() => mockActiveConversationRef),
  setActiveConversationRef: jest.fn((ref: string | null) => {
    mockActiveConversationRef = ref;
  }),
  getTranscriptSessionInfo: jest.fn(() => ({
    conversationRef: mockActiveConversationRef,
    userId: null,
  })),
  recordUserMessage: jest.fn(),
}));

const mockExtractOSstate = extractOSstate as jest.MockedFunction<typeof extractOSstate>;
const mockSendQuery = ApiClient.sendQuery as jest.MockedFunction<typeof ApiClient.sendQuery>;
const mockUploadArtifactBase64 = uploadArtifactBase64 as jest.MockedFunction<typeof uploadArtifactBase64>;
const mockRecordUserMessage = recordUserMessage as jest.MockedFunction<typeof recordUserMessage>;
const mockGetActiveConversationRef = getActiveConversationRef as jest.MockedFunction<typeof getActiveConversationRef>;
const mockSetActiveConversationRef = setActiveConversationRef as jest.MockedFunction<typeof setActiveConversationRef>;
const mockGetTranscriptSessionInfo = getTranscriptSessionInfo as jest.MockedFunction<typeof getTranscriptSessionInfo>;

describe('useChatMessageSender', () => {
  function renderSender(
    options?: Parameters<typeof useChatMessageSender>[1],
    stopPlayback?: () => void,
  ) {
    return renderHook(() => useChatMessageSender(stopPlayback, options));
  }

  async function sendText(
    sender: ReturnType<typeof renderSender>['result'],
    text: string,
  ) {
    await act(async () => {
      await sender.current.sendMessage(text);
    });
  }

  function expectSingleSendQueryCall(
    text: string,
    conversationRef: string,
    screenshotRef: string | null = null,
    screenshotUrl: string | null = null,
  ) {
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    expect(mockSendQuery).toHaveBeenCalledWith(
      text,
      conversationRef,
      screenshotRef,
      screenshotUrl,
    );
  }

  function expectNoShowChatboxCall() {
    expect((window as any).ipc.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      expect.anything(),
    );
  }

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockExtractOSstate.mockReset();
    mockSendQuery.mockReset();
    mockUploadArtifactBase64.mockReset();
    mockActiveConversationRef = null;
    mockFrontendConfig = { include_query_screenshot: true };
    mockGetActiveConversationRef.mockClear();
    mockSetActiveConversationRef.mockClear();
    mockGetTranscriptSessionInfo.mockClear();
    mockRecordUserMessage.mockClear();

    useChatStore.setState({
      messages: [],
      isSending: false,
      thinkingStatus: null,
      tokenCounts: null,
    });

    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('msg-1');

    (window as any).ipc = {
      send: jest.fn(),
      invoke: jest.fn().mockResolvedValue({ success: true }),
      on: jest.fn(),
      once: jest.fn(),
    };

    mockExtractOSstate.mockResolvedValue({ systemState: null, screenshot: null });
    mockSendQuery.mockResolvedValue(undefined);
    mockUploadArtifactBase64.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).ipc;
  });

  test('does not return to chatbox from main-window sends', async () => {
    const { result } = renderSender({ senderSurface: 'main-window' });
    await sendText(result, 'hello');
    expectNoShowChatboxCall();
  });

  test('uses default options when omitted', async () => {
    const { result } = renderSender();
    await sendText(result, 'hello');
    expectNoShowChatboxCall();
    expectSingleSendQueryCall('hello', 'conv_msg-1');
  });

  test('overlay-chatbox surface never switches windows by default', async () => {
    const { result } = renderSender({ senderSurface: 'overlay-chatbox' });
    await sendText(result, 'hello');

    expect((window as any).ipc.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    );
  });

  test('continues send flow when overlay return-to-chatbox invoke fails', async () => {
    (window as any).ipc.invoke = jest.fn().mockRejectedValue(new Error('show-failed'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderSender({
      senderSurface: 'overlay-chatbox',
      returnToChatboxPolicy: 'always',
    });

    await sendText(result, 'hello');

    expectSingleSendQueryCall('hello', 'conv_msg-1');
    expect(warnSpy).toHaveBeenCalledWith(
      '[useChatMessageSender] Failed to show chatbox:',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  test('does not return to chatbox when screenshots are disabled even if requested', async () => {
    mockFrontendConfig = { include_query_screenshot: false };
    const { result } = renderSender({ senderSurface: 'main-window' });
    await sendText(result, 'hello');

    expect((window as any).ipc.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    );
  });

  test('ignores explicit always return policy for main-window sends', async () => {
    mockFrontendConfig = { include_query_screenshot: false };
    const { result } = renderSender({
      senderSurface: 'main-window',
      returnToChatboxPolicy: 'always',
    });
    await sendText(result, 'hello');
    expect((window as any).ipc.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      expect.anything(),
    );
  });

  test('overlay surface honors explicit always return policy', async () => {
    const { result } = renderSender({
      senderSurface: 'overlay-chatbox',
      returnToChatboxPolicy: 'always',
    });
    await sendText(result, 'hello');

    expect((window as any).ipc.invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    );
  });

  test('marks first user message capture path on first send', async () => {
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello');

    expect(mockExtractOSstate).toHaveBeenCalledWith(
      true,
      false,
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

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'second');

    expect(mockExtractOSstate).toHaveBeenCalledWith(
      true,
      false,
      0,
      false,
    );
  });

  test('skips screenshot capture when include_query_screenshot is disabled', async () => {
    mockFrontendConfig = { include_query_screenshot: false };
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'no image');

    expect(mockExtractOSstate).not.toHaveBeenCalled();
    expect(mockUploadArtifactBase64).not.toHaveBeenCalled();
    expectSingleSendQueryCall('no image', 'conv_msg-1');
  });

  test('skips screenshot capture for main-window sends', async () => {
    const { result } = renderSender({ senderSurface: 'main-window' });
    await sendText(result, 'dashboard text');

    expect(mockExtractOSstate).not.toHaveBeenCalled();
    expect(mockUploadArtifactBase64).not.toHaveBeenCalled();
    expectSingleSendQueryCall('dashboard text', 'conv_msg-1');
  });

  test('calls stopPlayback when provided', async () => {
    const stopPlayback = jest.fn();
    const { result } = renderSender({ returnToChatboxPolicy: 'never' }, stopPlayback);
    await sendText(result, 'hello');

    expect(stopPlayback).toHaveBeenCalledTimes(1);
  });

  test('continues sending query when screenshot capture fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockExtractOSstate.mockRejectedValue(new Error('capture-failed'));

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello');

    expect(mockUploadArtifactBase64).not.toHaveBeenCalled();
    expectSingleSendQueryCall('hello', 'conv_msg-1');
    expect(errorSpy).toHaveBeenCalledWith(
      '[useChatMessageSender] Failed to extract OS state:',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  test('continues sending query when artifact upload fails', async () => {
    mockExtractOSstate.mockResolvedValue({
      systemState: { active_window: 'App' } as any,
      screenshot: 'base64-shot',
      screenshotContentType: 'image/png',
    });
    mockUploadArtifactBase64.mockRejectedValue(new Error('upload failed'));

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello');

    expect(mockUploadArtifactBase64).toHaveBeenCalled();
    expect(mockUploadArtifactBase64).toHaveBeenCalledWith(
      'base64-shot',
      'image/png',
      'user-message.png',
    );
    expectSingleSendQueryCall('hello', 'conv_msg-1');
  });

  test('sends uploaded screenshot refs to backend and updates message attachment', async () => {
    mockExtractOSstate.mockResolvedValue({
      systemState: null,
      screenshot: 'base64-shot',
      screenshotContentType: 'image/png',
    } as any);
    mockUploadArtifactBase64.mockResolvedValue({
      artifactId: 'artifact-1',
      url: '/api/artifacts/artifact-1',
    } as any);

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello');

    expectSingleSendQueryCall(
      'hello',
      'conv_msg-1',
      'artifact-1',
      '/api/artifacts/artifact-1',
    );
    expect(useChatStore.getState().messages[0]).toEqual(
      expect.objectContaining({
        screenshotRef: 'artifact-1',
        screenshotUrl: '/api/artifacts/artifact-1',
      }),
    );
    expect(mockRecordUserMessage.mock.calls.length).toBe(1);
    expect(mockRecordUserMessage.mock.calls[0][0]).toBe('hello');
    expect(mockRecordUserMessage.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        conversationRef: 'conv_msg-1',
        screenshotRef: 'artifact-1',
      }),
    );
  });

  test('resets sending state and appends error message when send fails', async () => {
    mockSendQuery.mockRejectedValue(new Error('send failed'));

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });

    let thrownError: Error | null = null;
    await act(async () => {
      try {
        await result.current.sendMessage('hello');
      } catch (error: any) {
        thrownError = error;
      }
    });

    expect(thrownError?.message).toBe('send failed');

    expect(useChatStore.getState().isSending).toBe(false);
    const messages = useChatStore.getState().messages;
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        type: 'error',
        text: 'Failed to send message. Please try again.',
      }),
    );
  });

  test('reuses existing conversation ref without generating a new one', async () => {
    mockActiveConversationRef = 'conv_existing';
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello again');

    expect(mockSetActiveConversationRef).not.toHaveBeenCalled();
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    expect(mockSendQuery.mock.calls[0][1]).toBe('conv_existing');
    expect(mockRecordUserMessage.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        conversationRef: 'conv_existing',
      }),
    );
  });
});
