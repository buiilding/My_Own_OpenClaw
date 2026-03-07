import { act, renderHook } from '@testing-library/react';
import { useChatMessageSender } from '../../frontend/src/renderer/features/chat/hooks/useChatMessageSender';
import {
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { captureScreenshotAttachment } from '../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline';
import { ApiClient } from '../../frontend/src/renderer/infrastructure/api/client';
import { uploadArtifactBase64 } from '../../frontend/src/renderer/infrastructure/services/ArtifactUploader';
import {
  getActiveConversationRef,
  getTranscriptSessionInfo,
  recordUserMessage,
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';

let mockFrontendConfig: Record<string, unknown> = {
  include_query_screenshot: true,
};

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: jest.fn(() => ({
    config: mockFrontendConfig,
  })),
}));

jest.mock('../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline', () => ({
  ...jest.requireActual('../../frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline'),
  captureScreenshotAttachment: jest.fn(),
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
  updateTranscriptSession: jest.fn((conversationRef?: string | null, userId?: string | null) => ({
    conversationRef: conversationRef ?? null,
    userId: userId ?? null,
  })),
  getTranscriptSessionInfo: jest.fn(() => ({
    conversationRef: mockActiveConversationRef,
    userId: null,
  })),
  recordUserMessage: jest.fn(),
}));

const mockCaptureScreenshotAttachment = captureScreenshotAttachment as jest.MockedFunction<typeof captureScreenshotAttachment>;
const mockSendQuery = ApiClient.sendQuery as jest.MockedFunction<typeof ApiClient.sendQuery>;
const mockUploadArtifactBase64 = uploadArtifactBase64 as jest.MockedFunction<typeof uploadArtifactBase64>;
const mockRecordUserMessage = recordUserMessage as jest.MockedFunction<typeof recordUserMessage>;
const mockGetActiveConversationRef = getActiveConversationRef as jest.MockedFunction<typeof getActiveConversationRef>;
const mockSetActiveConversationRef = setActiveConversationRef as jest.MockedFunction<typeof setActiveConversationRef>;
const mockUpdateTranscriptSession = updateTranscriptSession as jest.MockedFunction<typeof updateTranscriptSession>;
const mockGetTranscriptSessionInfo = getTranscriptSessionInfo as jest.MockedFunction<typeof getTranscriptSessionInfo>;
const DEFAULT_CHAT_WORKSPACE_REF = '__default__';

function createInitialStreamTracking() {
  return {
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
  };
}

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

  async function sendPayload(
    sender: ReturnType<typeof renderSender>['result'],
    payload: any,
  ) {
    await act(async () => {
      await sender.current.sendMessage(payload);
    });
  }

  function expectSingleSendQueryCall(
    text: string,
    conversationRef: string,
    screenshotRef: string | null = null,
    screenshotUrl: string | null = null,
    screenshotRefs: string[] | null = null,
    captureMeta: Record<string, unknown> | null = null,
    attachmentContext: string | null = null,
    attachmentFilenames: string[] | null = null,
  ) {
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    const call = mockSendQuery.mock.calls[0];
    expect(call[0]).toBe(text);
    expect(call[1]).toBe(conversationRef);
    expect(call[2]).toBe(screenshotRef);
    expect(call[3]).toBe(screenshotUrl);
    expect(call[4]).toEqual(screenshotRefs);
    expect((call[5] ?? null) as Record<string, unknown> | null).toEqual(captureMeta);
    expect((call[6] ?? null) as string | null).toBe(attachmentContext);
    const actualAttachmentFilenames = (call[7] ?? null) as string[] | null;
    if (attachmentFilenames === null) {
      expect(actualAttachmentFilenames === null || typeof actualAttachmentFilenames === 'undefined').toBe(true);
      return;
    }
    expect(Array.isArray(actualAttachmentFilenames)).toBe(true);
    expect(actualAttachmentFilenames?.length).toBe(attachmentFilenames.length);
    for (let index = 0; index < attachmentFilenames.length; index += 1) {
      expect(actualAttachmentFilenames?.[index]).toBe(attachmentFilenames[index]);
    }
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
    mockCaptureScreenshotAttachment.mockReset();
    mockSendQuery.mockReset();
    mockUploadArtifactBase64.mockReset();
    mockActiveConversationRef = null;
    mockFrontendConfig = { include_query_screenshot: true };
    mockGetActiveConversationRef.mockClear();
    mockSetActiveConversationRef.mockClear();
    mockUpdateTranscriptSession.mockClear();
    mockGetTranscriptSessionInfo.mockClear();
    mockRecordUserMessage.mockClear();

    const streamTracking = createInitialStreamTracking();
    useChatStore.setState({
      activeConversationRef: null,
      turnConversationRefs: {},
      workspaces: {
        [DEFAULT_CHAT_WORKSPACE_REF]: {
          messages: [],
          isSending: false,
          thinkingStatus: null,
          thinkingSourceEventType: null,
          tokenCounts: null,
          streamTracking,
        },
      },
      messages: [],
      isSending: false,
      thinkingStatus: null,
      thinkingSourceEventType: null,
      tokenCounts: null,
      streamTracking,
    });

    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('msg-1');

    const invoke = jest.fn().mockImplementation((channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
        return Promise.resolve({
          conversationRef: null,
          userId: null,
          isConnected: true,
          backendWsUrl: 'ws://127.0.0.1:8765/ws',
          backendHttpUrl: 'http://127.0.0.1:8765',
        });
      }
      return Promise.resolve({ success: true });
    });

    (window as any).ipc = {
      send: jest.fn(),
      invoke,
      on: jest.fn(),
      once: jest.fn(),
    };

    mockCaptureScreenshotAttachment.mockResolvedValue({
      screenshot: null,
      screenshotRef: null,
      screenshotUrl: null,
      screenshotContentType: null,
      captureMeta: null,
    });
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

    expect(mockCaptureScreenshotAttachment).toHaveBeenCalledWith({
      waitSeconds: 0,
      isFirstUserMessage: true,
    });
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

    expect(mockCaptureScreenshotAttachment).toHaveBeenCalledWith({
      waitSeconds: 0,
      isFirstUserMessage: false,
    });
  });

  test('skips screenshot capture when include_query_screenshot is disabled', async () => {
    mockFrontendConfig = { include_query_screenshot: false };
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'no image');

    expect(mockCaptureScreenshotAttachment).not.toHaveBeenCalled();
    expect(mockUploadArtifactBase64).not.toHaveBeenCalled();
    expectSingleSendQueryCall('no image', 'conv_msg-1');
  });

  test('skips screenshot capture for main-window sends', async () => {
    const { result } = renderSender({ senderSurface: 'main-window' });
    await sendText(result, 'dashboard text');

    expect(mockCaptureScreenshotAttachment).not.toHaveBeenCalled();
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
    mockCaptureScreenshotAttachment.mockRejectedValue(new Error('capture-failed'));

    try {
      const { result } = renderSender({ returnToChatboxPolicy: 'never' });
      await sendText(result, 'hello');

      expect(mockUploadArtifactBase64).not.toHaveBeenCalled();
      expectSingleSendQueryCall('hello', 'conv_msg-1');
      expect(errorSpy.mock.calls.some(([message, error]) => (
        message === '[queryScreenshotPipeline] Failed to capture screenshot attachment:'
        && error instanceof Error
        && error.message === 'capture-failed'
      ))).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('continues sending query when artifact upload fails', async () => {
    mockCaptureScreenshotAttachment.mockResolvedValue({
      screenshot: 'base64-shot',
      screenshotContentType: 'image/png',
      screenshotRef: null,
      screenshotUrl: null,
      captureMeta: null,
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
    mockCaptureScreenshotAttachment.mockResolvedValue({
      screenshot: 'base64-shot',
      screenshotContentType: 'image/png',
      screenshotRef: null,
      screenshotUrl: null,
      captureMeta: null,
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
      ['artifact-1'],
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

  test('reuses auto-capture screenshot_ref and screenshot_url when screenshot bytes are absent', async () => {
    mockCaptureScreenshotAttachment.mockResolvedValue({
      screenshot: null,
      screenshotRef: 'artifact-auto-1',
      screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-auto-1',
      screenshotContentType: null,
      captureMeta: null,
    } as any);

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello auto screenshot');

    expect(mockUploadArtifactBase64).not.toHaveBeenCalled();
    expectSingleSendQueryCall(
      'hello auto screenshot',
      'conv_msg-1',
      'artifact-auto-1',
      'http://127.0.0.1:8765/api/artifacts/artifact-auto-1',
      ['artifact-auto-1'],
    );
    expect(useChatStore.getState().messages[0]).toEqual(
      expect.objectContaining({
        screenshotRef: 'artifact-auto-1',
        screenshotUrl: 'http://127.0.0.1:8765/api/artifacts/artifact-auto-1',
      }),
    );
  });

  test('uploads pasted clipboard image and sends its artifact ref', async () => {
    mockUploadArtifactBase64.mockResolvedValue({
      artifactId: 'artifact-clipboard-1',
      url: '/api/artifacts/artifact-clipboard-1',
    } as any);

    const { result } = renderSender({ senderSurface: 'main-window' });

    await sendPayload(result, {
      text: 'Please inspect this image',
      clipboardImage: {
        base64: 'clipboard-image-base64',
        contentType: 'image/png',
        filename: 'clipboard-image.png',
      },
    });

    expect(mockCaptureScreenshotAttachment).not.toHaveBeenCalled();
    expect(mockUploadArtifactBase64).toHaveBeenCalledWith(
      'clipboard-image-base64',
      'image/png',
      'clipboard-image.png',
    );
    expectSingleSendQueryCall(
      'Please inspect this image',
      'conv_msg-1',
      'artifact-clipboard-1',
      '/api/artifacts/artifact-clipboard-1',
      ['artifact-clipboard-1'],
      null,
      null,
      ['clipboard-image.png'],
    );
    expect(useChatStore.getState().messages[0]).toEqual(
      expect.objectContaining({
        text: 'Please inspect this image',
        screenshot: 'clipboard-image-base64',
        screenshotRef: 'artifact-clipboard-1',
        screenshotUrl: '/api/artifacts/artifact-clipboard-1',
        screenshots: [
          expect.objectContaining({
            screenshotRef: 'artifact-clipboard-1',
            screenshotUrl: '/api/artifacts/artifact-clipboard-1',
          }),
        ],
      }),
    );
  });

  test('uploads multiple pasted clipboard images and sends all screenshot refs', async () => {
    mockUploadArtifactBase64
      .mockResolvedValueOnce({
        artifactId: 'artifact-clipboard-1',
        url: '/api/artifacts/artifact-clipboard-1',
      } as any)
      .mockResolvedValueOnce({
        artifactId: 'artifact-clipboard-2',
        url: '/api/artifacts/artifact-clipboard-2',
      } as any);

    const { result } = renderSender({ senderSurface: 'main-window' });

    await sendPayload(result, {
      text: 'Please inspect both images',
      clipboardImages: [
        {
          base64: 'clipboard-image-base64-1',
          contentType: 'image/png',
          filename: 'clipboard-image-1.png',
        },
        {
          base64: 'clipboard-image-base64-2',
          contentType: 'image/jpeg',
          filename: 'clipboard-image-2.jpg',
        },
      ],
    });

    expect(mockCaptureScreenshotAttachment).not.toHaveBeenCalled();
    expect(mockUploadArtifactBase64).toHaveBeenNthCalledWith(
      1,
      'clipboard-image-base64-1',
      'image/png',
      'clipboard-image-1.png',
    );
    expect(mockUploadArtifactBase64).toHaveBeenNthCalledWith(
      2,
      'clipboard-image-base64-2',
      'image/jpeg',
      'clipboard-image-2.jpg',
    );
    expectSingleSendQueryCall(
      'Please inspect both images',
      'conv_msg-1',
      'artifact-clipboard-1',
      '/api/artifacts/artifact-clipboard-1',
      ['artifact-clipboard-1', 'artifact-clipboard-2'],
      null,
      null,
      ['clipboard-image-1.png', 'clipboard-image-2.jpg'],
    );
    expect(useChatStore.getState().messages[0]).toEqual(
      expect.objectContaining({
        text: 'Please inspect both images',
        screenshotRef: 'artifact-clipboard-1',
        screenshotUrl: '/api/artifacts/artifact-clipboard-1',
        screenshots: [
          expect.objectContaining({
            screenshotRef: 'artifact-clipboard-1',
            screenshotUrl: '/api/artifacts/artifact-clipboard-1',
          }),
          expect.objectContaining({
            screenshotRef: 'artifact-clipboard-2',
            screenshotUrl: '/api/artifacts/artifact-clipboard-2',
          }),
        ],
      }),
    );
  });

  test('reads selected non-image files via read_file and injects hidden attachment context', async () => {
    (window as any).ipc.invoke = jest.fn().mockImplementation((channel: string, payload: any) => {
      if (channel === INVOKE_CHANNELS.EXECUTE_TOOL) {
        expect(payload).toEqual(expect.objectContaining({
          toolName: 'read_file',
          args: { file_path: '/tmp/notes.txt' },
          skipAutoCapture: true,
        }));
        return Promise.resolve({
          success: true,
          data: {
            llm_content: 'File path: /tmp/notes.txt\n\nImportant notes',
          },
        });
      }
      return Promise.resolve({ success: true });
    });

    const { result } = renderSender({ senderSurface: 'main-window' });

    await sendPayload(result, {
      text: 'Summarize the attached file',
      readableFiles: [
        {
          filePath: '/tmp/notes.txt',
          filename: 'notes.txt',
        },
      ],
    });

    expectSingleSendQueryCall(
      'Summarize the attached file',
      'conv_msg-1',
      null,
      null,
      null,
      null,
      '--- Attached File: notes.txt ---\nFile path: /tmp/notes.txt\n\nImportant notes',
      ['notes.txt'],
    );

    expect(useChatStore.getState().messages[0]).toEqual(
      expect.objectContaining({
        text: 'Summarize the attached file',
        attachmentFilenames: ['notes.txt'],
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

  test('hydrates missing conversation ref from main startup snapshot before first send', async () => {
    (window as any).ipc.invoke = jest.fn().mockImplementation((channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
        return Promise.resolve({
          conversationRef: 'conv-main-snapshot',
          userId: 'user-main-snapshot',
          isConnected: true,
        });
      }
      return Promise.resolve({ success: true });
    });
    mockActiveConversationRef = null;
    useChatStore.setState({ activeConversationRef: null });

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'resume on startup');

    expect(mockSetActiveConversationRef).toHaveBeenCalledWith('conv-main-snapshot');
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv-main-snapshot', 'user-main-snapshot');
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    expect(mockSendQuery.mock.calls[0][1]).toBe('conv-main-snapshot');
  });

  test('reuses chat store active conversation ref when transcript session ref is temporarily missing', async () => {
    useChatStore.setState({
      activeConversationRef: 'conv_store_active',
    });
    mockActiveConversationRef = null;

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'resume same chat');

    expect(mockSetActiveConversationRef).toHaveBeenCalledWith('conv_store_active');
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    expect(mockSendQuery.mock.calls[0][1]).toBe('conv_store_active');
    expect(mockRecordUserMessage.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        conversationRef: 'conv_store_active',
      }),
    );
  });
});
