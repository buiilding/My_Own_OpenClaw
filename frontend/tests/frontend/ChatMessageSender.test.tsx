/**
 * Covers chat message sender. behavior in the frontend test suite.
 */

import {
  act,
  renderHook,
} from '@testing-library/react';
import { useChatMessageSender } from '../../src/renderer/features/chat/hooks/useChatMessageSender';
import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  setConversationViewInChatStore,
  setMessagesInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import { INVOKE_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';
import { DesktopLiveTurnRuntimeClient } from '../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopSettingsRuntimeClient } from '../../src/renderer/app/runtime/desktopSettingsRuntimeClient';
import {
  DesktopChatInterfacePresentationRuntime,
} from '../../src/renderer/app/runtime/desktopChatInterfacePresentationRuntime';

let mockRendererConfig: Record<string, unknown> = {
  include_query_screenshot: true,
  model_provider: 'openai',
  selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
};

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: jest.fn(() => ({
    config: mockRendererConfig,
  })),
}));

let mockActiveConversationRef: string | null = null;
jest.mock('../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient', () => ({
  DesktopLiveTurnRuntimeClient: {
    sendQuery: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopSettingsRuntimeClient', () => ({
  DesktopSettingsRuntimeClient: {
    setModel: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
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
  },
}));

const mockSendQuery = DesktopLiveTurnRuntimeClient.sendQuery as jest.Mock;
const mockSetModel = DesktopSettingsRuntimeClient.setModel as jest.Mock;
const mockGetActiveConversationRef = DesktopTranscriptSessionRuntimeClient.getActiveConversationRef as jest.Mock;
const mockSetActiveConversationRef = DesktopTranscriptSessionRuntimeClient.setActiveConversationRef as jest.Mock;
const mockUpdateTranscriptSession = DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock;
const mockGetTranscriptSessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo as jest.Mock;
const { buildChatInterfacePresentationState } = DesktopChatInterfacePresentationRuntime;
const DEFAULT_CHAT_WORKSPACE_REF = '__default__';

function getActiveWorkspace() {
  return useChatStore.getState().getWorkspaceState();
}

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
    expectedResources: unknown[] | null = null,
  ) {
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    const call = mockSendQuery.mock.calls[0][0];
    expect(call.text).toBe(text);
    expect(call.conversationRef).toBe(conversationRef);
    expect(call.turnRef).toBe('msg-1');
    expect(call).not.toHaveProperty('screenshotRef');
    expect(call).not.toHaveProperty('screenshotUrl');
    expect(call).not.toHaveProperty('screenshotRefs');
    expect(call).not.toHaveProperty('captureMeta');
    expect(call).not.toHaveProperty('attachmentContext');
    expect(call).not.toHaveProperty('metadata');
    if (expectedResources) {
      expect(call.resources).toEqual(expectedResources);
    }
  }

  function expectNoShowChatboxCall() {
    expect((window as any).ipc.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      expect.anything(),
    );
  }

  function expectPendingBridgeUserMessage(text: string) {
    const activeWorkspace = getActiveWorkspace();
    expect(activeWorkspace.messages).toEqual([]);
    const renderedMessages = buildChatInterfacePresentationState({
      activeConversationRef: useChatStore.getState().activeConversationRef,
      conversationView: activeWorkspace.conversationView,
      messages: activeWorkspace.messages,
      pendingTurn: activeWorkspace.pendingTurn,
      rendererAnnotations: [],
      sdkLiveTurn: activeWorkspace.sdkLiveTurn,
    }).renderedMessages;
    expect(renderedMessages).toEqual([
      expect.objectContaining({
        id: 'msg-1-sdk-evt-000002-user_message',
        sender: 'user',
        text,
        turnRef: 'msg-1',
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
        isComplete: true,
        attachments: null,
      }),
    ]);
    return renderedMessages[0];
  }

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSendQuery.mockReset();
    mockSetModel.mockReset();
    mockActiveConversationRef = null;
    mockRendererConfig = {
      include_query_screenshot: true,
      model_provider: 'openai',
      selected_model_id: 'gpt-5.4@@gpt-5-4-none-thinking',
    };
    mockGetActiveConversationRef.mockClear();
    mockSetActiveConversationRef.mockClear();
    mockUpdateTranscriptSession.mockClear();
    mockGetTranscriptSessionInfo.mockClear();

    const streamTracking = createInitialStreamTracking();
    useChatStore.setState({
      activeConversationRef: null,
      workspaces: {
        [DEFAULT_CHAT_WORKSPACE_REF]: {
          messages: [],
          isSending: false,
          thinkingStatus: null,
          thinkingSourceEventType: null,
          compactionDebugInfo: null,
          tokenCounts: null,
          streamTracking,
          sdkLiveTurn: null,
          conversationView: null,
          pendingTurn: null,
        },
      },
    });

    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('msg-1');

    const invoke = jest.fn().mockImplementation((channel: string) => {
      if (channel === INVOKE_CHANNELS.GET_CLIENT_USER_ID) {
        return Promise.resolve({
          conversationRef: null,
          userId: null,
          isConnected: true,
          runtimeWsUrl: 'ws://127.0.0.1:8765/ws',
          runtimeHttpUrl: 'http://127.0.0.1:8765',
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

    mockSendQuery.mockResolvedValue(undefined);
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
    expect(mockSetModel.mock.calls[0][0]).toEqual({
      modelProvider: 'openai',
      modelId: expect.any(String),
    });
    expectSingleSendQueryCall('hello', 'conv_msg-1');
  });

  test('syncs selected model to backend immediately before sending query', async () => {
    mockRendererConfig = {
      include_query_screenshot: false,
      model_provider: 'anthropic',
      selected_model_id: 'claude-sonnet-4-5',
    };
    let resolveModelSync: (() => void) | null = null;
    const modelSyncPromise = new Promise<void>((resolve) => {
      resolveModelSync = resolve;
    });
    mockSetModel.mockReturnValueOnce(modelSyncPromise);
    const { result } = renderSender();

    let sendPromise: Promise<void> = Promise.resolve();
    act(() => {
      sendPromise = result.current.sendMessage('use anthropic');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSetModel.mock.calls.length).toBe(1);
    expect(mockSetModel.mock.calls[0][0]).toEqual({
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet-4-5',
    });
    expect(mockSendQuery).not.toHaveBeenCalled();

    resolveModelSync?.();
    await act(async () => {
      await sendPromise;
    });

    expect(mockSetModel.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendQuery.mock.invocationCallOrder[0],
    );
  });

  test('shows a pending-bridge user row before async send preparation finishes', async () => {
    mockActiveConversationRef = 'conv_existing';
    let resolvePermission: ((value: unknown) => void) | null = null;
    const permissionPromise = new Promise((resolve) => {
      resolvePermission = resolve;
    });
    (window as any).ipc.invoke = jest.fn().mockImplementation((channel: string) => {
      if (channel === INVOKE_CHANNELS.CHECK_PERMISSION) {
        return permissionPromise;
      }
      return Promise.resolve({ success: true });
    });
    const { result } = renderSender({
      senderSurface: 'main-window',
      returnToChatboxPolicy: 'never',
    });

    let sendPromise: Promise<void> = Promise.resolve();
    act(() => {
      sendPromise = result.current.sendMessage('hello while prepping');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expectPendingBridgeUserMessage('hello while prepping');
    expect(getActiveWorkspace().isSending).toBe(true);
    expect(mockSendQuery).not.toHaveBeenCalled();

    resolvePermission?.({ success: true });
    await act(async () => {
      await sendPromise;
    });

    expectSingleSendQueryCall('hello while prepping', 'conv_existing');
  });

  test('overlay-chatbox surface never switches windows by default', async () => {
    const { result } = renderSender({ senderSurface: 'overlay-chatbox' });
    await sendText(result, 'hello');

    expect((window as any).ipc.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    );
  });

  test('overlay-chatbox broadcasts pending turn immediately on send', async () => {
    const { result } = renderSender({ senderSurface: 'overlay-chatbox' });
    await sendText(result, 'hello');

    expect((window as any).ipc.send).toHaveBeenCalledWith(
      'windie:pending-turn',
      expect.objectContaining({
        type: 'pending',
        pendingTurn: expect.objectContaining({
          conversationRef: 'conv_msg-1',
          turnRef: 'msg-1',
          text: 'hello',
        }),
      }),
    );
  });

  test('main-window sends use the same pending turn broadcast', async () => {
    const { result } = renderSender({ senderSurface: 'main-window' });
    await sendText(result, 'hello');

    expect((window as any).ipc.send).toHaveBeenCalledWith(
      'windie:pending-turn',
      expect.objectContaining({
        type: 'pending',
        pendingTurn: expect.objectContaining({
          conversationRef: 'conv_msg-1',
          turnRef: 'msg-1',
          text: 'hello',
        }),
      }),
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
    mockRendererConfig = { include_query_screenshot: false };
    const { result } = renderSender({ senderSurface: 'main-window' });
    await sendText(result, 'hello');

    expect((window as any).ipc.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.SHOW_CHATBOX,
      { focus: false },
    );
  });

  test('ignores explicit always return policy for main-window sends', async () => {
    mockRendererConfig = { include_query_screenshot: false };
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

    expectSingleSendQueryCall('hello', 'conv_msg-1', [{
      kind: 'query_screenshot_request',
      isFirstUserMessage: true,
      reason: 'query_send_with_capture',
      required: false,
    }]);
  });

  test('uses non-first capture path when user message already exists', async () => {
    setMessagesInChatStore([
      {
        id: 'existing-user',
        text: 'previous',
        sender: 'user',
      },
    ]);

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'second');

    expectSingleSendQueryCall('second', 'conv_msg-1', [{
      kind: 'query_screenshot_request',
      isFirstUserMessage: false,
      reason: 'query_send_with_capture',
      required: false,
    }]);
  });

  test('uses sdk conversation view rows to detect prior user messages', async () => {
    useChatStore.getState().setActiveConversationRef('conv-existing');
    setConversationViewInChatStore({
      conversationRef: 'conv-existing',
      revisionId: 'rev-existing',
      displayRows: [{
        id: 'view-user-row',
        conversationRef: 'conv-existing',
        turnRef: 'turn-existing',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'previous from sdk view',
      }],
      liveTurn: {
        turnRef: null,
        phase: 'idle',
        entries: [],
        isBusy: false,
        isTerminal: true,
        canStop: false,
        lastError: null,
      },
      surfaces: {
        pill: { mode: 'idle' },
        dashboard: { mode: 'idle' },
        responseOverlay: {
          mode: 'hidden',
          visible: false,
          guardRef: null,
          ownerConversationRef: 'conv-existing',
          turnRef: null,
        },
      },
      actions: {
        canEdit: true,
        canRetry: true,
        canFork: true,
      },
    } as any, 'conv-existing');

    expect(getActiveWorkspace().messages).toEqual([]);

    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'second from resumed view');

    expectSingleSendQueryCall('second from resumed view', 'conv-existing', [{
      kind: 'query_screenshot_request',
      isFirstUserMessage: false,
      reason: 'query_send_with_capture',
      required: false,
    }]);
  });

  test('skips screenshot capture when include_query_screenshot is disabled', async () => {
    mockRendererConfig = { include_query_screenshot: false };
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'no image');

    expectSingleSendQueryCall('no image', 'conv_msg-1');
  });

  test('skips screenshot capture for main-window sends', async () => {
    const { result } = renderSender({ senderSurface: 'main-window' });
    await sendText(result, 'dashboard text');

    expectSingleSendQueryCall('dashboard text', 'conv_msg-1');
  });

  test('calls stopPlayback when provided', async () => {
    const stopPlayback = jest.fn();
    const { result } = renderSender({ returnToChatboxPolicy: 'never' }, stopPlayback);
    await sendText(result, 'hello');

    expect(stopPlayback).toHaveBeenCalledTimes(1);
  });

  test('does not capture screenshots in renderer before SDK send', async () => {
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello');

    expectSingleSendQueryCall('hello', 'conv_msg-1', [{
      kind: 'query_screenshot_request',
      isFirstUserMessage: true,
      reason: 'query_send_with_capture',
      required: false,
    }]);
  });

  test('sends screenshot capture request to the SDK without renderer-owned attachment state', async () => {
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello');

    expectSingleSendQueryCall('hello', 'conv_msg-1', [{
      kind: 'query_screenshot_request',
      isFirstUserMessage: true,
      reason: 'query_send_with_capture',
      required: false,
    }]);
    expect(expectPendingBridgeUserMessage('hello').attachments).toBeNull();
    expect(mockSendQuery.mock.calls[0][0].transcript).toBeUndefined();
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
  });

  test('does not resolve auto-capture screenshot refs in renderer before SDK send', async () => {
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello auto screenshot');

    expectSingleSendQueryCall('hello auto screenshot', 'conv_msg-1', [{
      kind: 'query_screenshot_request',
      isFirstUserMessage: true,
      reason: 'query_send_with_capture',
      required: false,
    }]);
    expectPendingBridgeUserMessage('hello auto screenshot');
  });

  test('sends pasted clipboard image as a SDK resource handle', async () => {
    const { result } = renderSender({ senderSurface: 'main-window' });

    await sendPayload(result, {
      text: 'Please inspect this image',
      clipboardImages: [
        {
          base64: 'clipboard-image-base64',
          contentType: 'image/png',
          filename: 'clipboard-image.png',
        },
      ],
    });

    expectSingleSendQueryCall('Please inspect this image', 'conv_msg-1', [{
      kind: 'clipboard_image',
      base64: 'clipboard-image-base64',
      contentType: 'image/png',
      filename: 'clipboard-image.png',
      required: true,
    }]);
    expect(mockSendQuery.mock.calls[0][0]).not.toHaveProperty('attachmentFilenames');
    expectPendingBridgeUserMessage('Please inspect this image');
  });

  test('sends pasted image before camera screenshot request for mixed visual sends', async () => {
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });

    await sendPayload(result, {
      text: 'Please inspect this image and screen',
      clipboardImages: [
        {
          base64: 'clipboard-image-base64',
          contentType: 'image/png',
          filename: 'clipboard-image.png',
        },
      ],
    });

    expectSingleSendQueryCall('Please inspect this image and screen', 'conv_msg-1', [
      {
        kind: 'clipboard_image',
        base64: 'clipboard-image-base64',
        contentType: 'image/png',
        filename: 'clipboard-image.png',
        required: true,
      },
      {
        kind: 'query_screenshot_request',
        isFirstUserMessage: true,
        reason: 'query_send_with_capture',
        required: false,
      },
    ]);
    expect(mockSendQuery.mock.calls[0][0]).not.toHaveProperty('attachmentFilenames');
    expectPendingBridgeUserMessage('Please inspect this image and screen');
  });

  test('sends multiple pasted clipboard images as SDK resource handles', async () => {
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

    expectSingleSendQueryCall('Please inspect both images', 'conv_msg-1', [
      {
        kind: 'clipboard_image',
        base64: 'clipboard-image-base64-1',
        contentType: 'image/png',
        filename: 'clipboard-image-1.png',
        required: true,
      },
      {
        kind: 'clipboard_image',
        base64: 'clipboard-image-base64-2',
        contentType: 'image/jpeg',
        filename: 'clipboard-image-2.jpg',
        required: true,
      },
    ]);
    expect(mockSendQuery.mock.calls[0][0]).not.toHaveProperty('attachmentFilenames');
    expectPendingBridgeUserMessage('Please inspect both images');
  });

  test('sends selected non-image files as required SDK resource handles', async () => {
    (window as any).ipc.invoke = jest.fn().mockImplementation((channel: string, payload: any) => {
      if (channel === INVOKE_CHANNELS.READ_ATTACHMENT_FILE) {
        expect(payload).toEqual({
          filePath: '/tmp/notes.txt',
        });
        return Promise.resolve({
          success: true,
          data: {
            output: 'File path: /tmp/notes.txt\n\nImportant notes',
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

    expect((window as any).ipc.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.READ_ATTACHMENT_FILE,
      expect.anything(),
    );
    expectSingleSendQueryCall('Summarize the attached file', 'conv_msg-1', [{
      kind: 'readable_file',
      filePath: '/tmp/notes.txt',
      filename: 'notes.txt',
      required: true,
    }]);
    expect(mockSendQuery.mock.calls[0][0]).not.toHaveProperty('attachmentFilenames');

    expectPendingBridgeUserMessage('Summarize the attached file');
  });

  test('does not block renderer send when selected file resolution will happen in SDK', async () => {
    (window as any).ipc.invoke = jest.fn().mockImplementation((channel: string) => {
      if (channel === INVOKE_CHANNELS.READ_ATTACHMENT_FILE) {
        return Promise.resolve({
          success: false,
          error: 'permission denied',
        });
      }
      return Promise.resolve({ success: true });
    });

    const { result } = renderSender({ senderSurface: 'main-window' });

    let thrownError: Error | null = null;
    await act(async () => {
      try {
        await result.current.sendMessage({
          text: 'Summarize the attached file',
          readableFiles: [
            {
              filePath: '/tmp/private.txt',
              filename: 'private.txt',
            },
          ],
        });
      } catch (error: any) {
        thrownError = error;
      }
    });

    expect(thrownError).toBeNull();
    expect((window as any).ipc.invoke).not.toHaveBeenCalledWith(
      INVOKE_CHANNELS.READ_ATTACHMENT_FILE,
      expect.anything(),
    );
    expectSingleSendQueryCall('Summarize the attached file', 'conv_msg-1', [{
      kind: 'readable_file',
      filePath: '/tmp/private.txt',
      filename: 'private.txt',
      required: true,
    }]);
    expect(mockSendQuery.mock.calls[0][0]).not.toHaveProperty('attachmentFilenames');
    expectPendingBridgeUserMessage('Summarize the attached file');
  });

  test('clears pending bridge without appending a renderer error row when send fails', async () => {
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

    const activeWorkspace = getActiveWorkspace();
    expect(activeWorkspace.isSending).toBe(false);
    expect(activeWorkspace.pendingTurn).toBeNull();
    expect(activeWorkspace.messages).toEqual([]);
  });

  test('reuses existing conversation ref and synchronizes renderer stores immediately', async () => {
    mockActiveConversationRef = 'conv_existing';
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello again');

    expect(mockSetActiveConversationRef).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv_existing', null);
    expect(useChatStore.getState().activeConversationRef).toBe('conv_existing');
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    expect(mockSendQuery.mock.calls[0][0].conversationRef).toBe('conv_existing');
  });

  test('creates a conversation synchronously instead of waiting for main startup hydration', async () => {
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

    expect(mockSetActiveConversationRef).toHaveBeenCalledWith('conv_msg-1');
    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith('conv_msg-1', null);
    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    expect(mockSendQuery.mock.calls[0][0].conversationRef).toBe('conv_msg-1');
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
    expect(mockSendQuery.mock.calls[0][0].conversationRef).toBe('conv_store_active');
  });

  test('sends generated first-send conversation refs without renderer inference hydration', async () => {
    const { result } = renderSender({ returnToChatboxPolicy: 'never' });
    await sendText(result, 'hello');

    expect(mockSendQuery).toHaveBeenCalledTimes(1);
    expect(mockSendQuery.mock.calls[0][0].conversationRef).toBe('conv_msg-1');
  });
});
