/**
 * Covers desktop chat send preparation runtime boundaries.
 */

const mockAcceptPendingTurn = jest.fn();
const mockClearPendingTurn = jest.fn();
const mockFetchActiveWorkspaceSelection = jest.fn();
const mockGetConversationWorkspaceBinding = jest.fn();
const mockSetConversationWorkspaceBinding = jest.fn();
const mockSetPending = jest.fn();
const mockClearPending = jest.fn();
const mockSendQuery = jest.fn();
const mockSetModel = jest.fn();
const mockShowChatboxWithValues = jest.fn();
const mockLogUserSentMessage = jest.fn();
const mockLogRendererChatSendLifecycleTrace = jest.fn();
const mockSetTranscriptConversationRef = jest.fn();
const mockUpdateTranscriptSession = jest.fn();
const mockGetActiveTranscriptConversationRef = jest.fn();
const mockGetTranscriptSessionInfo = jest.fn();

jest.mock('../../frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient', () => ({
  DesktopWorkspaceRuntimeClient: {
    fetchActiveWorkspaceSelection: (...args: unknown[]) => mockFetchActiveWorkspaceSelection(...args),
    getConversationWorkspaceBinding: (...args: unknown[]) => mockGetConversationWorkspaceBinding(...args),
    setConversationWorkspaceBinding: (...args: unknown[]) => mockSetConversationWorkspaceBinding(...args),
    workspaceSelectionToBinding: (workspace: any) => ({
      workspacePath: workspace?.activeWorkspacePath || '',
      workspaceName: workspace?.activeWorkspaceName || '',
    }),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopPendingTurnRuntimeClient', () => ({
  DesktopPendingTurnRuntimeClient: {
    setPending: (...args: unknown[]) => mockSetPending(...args),
    clear: (...args: unknown[]) => mockClearPending(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient', () => ({
  DesktopLiveTurnRuntimeClient: {
    sendQuery: (...args: unknown[]) => mockSendQuery(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopSettingsRuntimeClient', () => ({
  DesktopSettingsRuntimeClient: {
    setModel: (...args: unknown[]) => mockSetModel(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopWindowRuntimeClient', () => ({
  DesktopWindowRuntimeClient: {
    showChatboxWithValues: (...args: unknown[]) => mockShowChatboxWithValues(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopInteractionRuntimeClient', () => ({
  DesktopInteractionRuntimeClient: {
    logUserSentMessage: (...args: unknown[]) => mockLogUserSentMessage(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopRendererTraceRuntime', () => ({
  DesktopRendererTraceRuntime: {
    logRendererChatSendLifecycleTrace: (...args: unknown[]) => mockLogRendererChatSendLifecycleTrace(...args),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: (...args: unknown[]) => mockGetActiveTranscriptConversationRef(...args),
    getTranscriptSessionInfo: (...args: unknown[]) => mockGetTranscriptSessionInfo(...args),
    setActiveConversationRef: (...args: unknown[]) => mockSetTranscriptConversationRef(...args),
    updateTranscriptSession: (...args: unknown[]) => mockUpdateTranscriptSession(...args),
  },
}));

import { DesktopChatSendPreparationRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime';

const {
  dispatchPreparedDesktopChatTurn,
  prepareDesktopChatSend,
} = DesktopChatSendPreparationRuntime;

describe('DesktopChatSendPreparationRuntime', () => {
  beforeEach(() => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('turn-1');
    mockAcceptPendingTurn.mockReset();
    mockClearPendingTurn.mockReset();
    mockClearPending.mockReset();
    mockFetchActiveWorkspaceSelection.mockReset();
    mockGetConversationWorkspaceBinding.mockReset();
    mockSetConversationWorkspaceBinding.mockReset();
    mockSetPending.mockReset();
    mockSendQuery.mockReset();
    mockSetModel.mockReset();
    mockShowChatboxWithValues.mockReset();
    mockLogUserSentMessage.mockReset();
    mockLogRendererChatSendLifecycleTrace.mockReset();
    mockSetTranscriptConversationRef.mockReset();
    mockUpdateTranscriptSession.mockReset();
    mockGetActiveTranscriptConversationRef.mockReset();
    mockGetTranscriptSessionInfo.mockReset();

    mockGetActiveTranscriptConversationRef.mockReturnValue(null);
    mockGetTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: 'user-1',
    });
    mockGetConversationWorkspaceBinding.mockReturnValue({
      workspacePath: '',
      workspaceName: '',
    });
    mockFetchActiveWorkspaceSelection.mockResolvedValue({
      workspace: {
        activeWorkspacePath: '/workspace/project',
        activeWorkspaceName: 'Project',
      },
    });
    mockSetConversationWorkspaceBinding.mockImplementation((_conversationRef, binding) => ({
      workspacePath: binding?.workspacePath || '',
      workspaceName: binding?.workspaceName || '',
    }));
    mockSendQuery.mockResolvedValue(undefined);
    mockSetModel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('prepares only pending bridge identity and typed SDK resources', async () => {
    const setChatActiveConversationRef = jest.fn();
    const preparedTurn = await prepareDesktopChatSend({
      payload: {
        text: 'look here',
        clipboardImages: [{
          base64: 'image-base64',
          contentType: 'image/png',
          filename: 'shot.png',
          displayAttachmentId: 'renderer-display-id',
          previewSrc: 'data:image/png;base64,preview',
          screenshotRef: 'artifact-legacy',
        }],
        readableFiles: [{
          filePath: '/workspace/project/notes.txt',
          filename: 'notes.txt',
        }],
      } as any,
      config: {
        selected_model_id: 'gpt-5.4',
        model_provider: 'openai',
      },
      dependencies: {
        acceptPendingTurn: mockAcceptPendingTurn,
        getActiveConversationRef: () => null,
        getSendReadModel: () => ({ hasPriorUserMessages: false }),
        setChatActiveConversationRef,
      },
      senderSurface: 'overlay-chatbox',
      sendLifecycle: {
        shouldCaptureQueryScreenshot: true,
        shouldReturnToChatboxOnSend: false,
        surfaceReason: 'overlay-chatbox',
      },
    });

    expect(setChatActiveConversationRef).toHaveBeenCalledWith('conv_turn-1');
    expect(mockAcceptPendingTurn).toHaveBeenCalledWith({
      conversationRef: 'conv_turn-1',
      turnRef: 'turn-1',
      userMessageId: 'turn-1-sdk-evt-000002-user_message',
      text: 'look here',
      timestamp: expect.any(String),
    });
    expect(mockSetPending).toHaveBeenCalledWith(mockAcceptPendingTurn.mock.calls[0][0]);
    expect(mockAcceptPendingTurn.mock.calls[0][0]).not.toHaveProperty('attachments');
    expect(mockAcceptPendingTurn.mock.calls[0][0]).not.toHaveProperty('screenshotRef');
    expect(mockAcceptPendingTurn.mock.calls[0][0]).not.toHaveProperty('displayAttachmentId');
    expect(preparedTurn).toEqual(expect.objectContaining({
      conversationRef: 'conv_turn-1',
      text: 'look here',
      turnRef: 'turn-1',
      workspacePath: '/workspace/project',
      deferredQueryModelSelection: {
        modelId: 'gpt-5.4',
        modelProvider: 'openai',
      },
    }));
    expect(preparedTurn?.resources).toEqual([
      {
        kind: 'readable_file',
        filePath: '/workspace/project/notes.txt',
        filename: 'notes.txt',
        required: true,
      },
      {
        kind: 'clipboard_image',
        base64: 'image-base64',
        contentType: 'image/png',
        filename: 'shot.png',
        required: true,
      },
      {
        kind: 'query_screenshot_request',
        isFirstUserMessage: true,
        reason: 'overlay-chatbox',
        required: false,
      },
      {
        kind: 'workspace',
        workspacePath: '/workspace/project',
        required: false,
      },
    ]);
    expect(JSON.stringify(preparedTurn?.resources)).not.toContain('displayAttachmentId');
    expect(JSON.stringify(preparedTurn?.resources)).not.toContain('previewSrc');
    expect(JSON.stringify(preparedTurn?.resources)).not.toContain('screenshotRef');
    expect(JSON.stringify(preparedTurn?.resources)).not.toContain('attachments');
  });

  test('dispatch clears the pending bridge when SDK send fails before turn authority opens', async () => {
    mockSendQuery.mockRejectedValue(new Error('send failed'));
    const preparedTurn = {
      conversationRef: 'conv-1',
      deferredQueryModelSelection: null,
      model: null,
      resources: [{
        kind: 'clipboard_image',
        base64: 'image-base64',
        contentType: 'image/png',
        filename: 'shot.png',
        required: true,
      }],
      sendLifecycle: {
        shouldCaptureQueryScreenshot: false,
        shouldReturnToChatboxOnSend: false,
        surfaceReason: 'overlay-chatbox',
      },
      sessionInfo: {
        conversationRef: 'conv-1',
        userId: 'user-1',
      },
      text: 'hello',
      timestamp: '2026-06-27T00:00:00.000Z',
      turnId: 'turn-1',
      turnRef: 'turn-1',
      workspacePath: null,
    };

    await expect(dispatchPreparedDesktopChatTurn(
      preparedTurn as any,
      { clearPendingTurn: mockClearPendingTurn },
    )).rejects.toThrow('send failed');

    expect(mockSendQuery).toHaveBeenCalledWith({
      text: 'hello',
      conversationRef: 'conv-1',
      workspacePath: null,
      resources: preparedTurn.resources,
      model: null,
      turnRef: 'turn-1',
    });
    expect(mockClearPendingTurn).toHaveBeenCalledWith({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
    expect(mockClearPending).toHaveBeenCalledWith({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
  });
});
