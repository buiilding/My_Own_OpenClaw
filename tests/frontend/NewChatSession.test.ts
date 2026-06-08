import { startNewChatSession } from '../../frontend/src/renderer/features/chat/utils/session/newChatSession';
import { DesktopTranscriptSessionRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import {
  setConversationWorkspaceBinding,
} from '../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding';

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    updateTranscriptSession: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding', () => ({
  setConversationWorkspaceBinding: jest.fn(),
  workspaceSelectionToBinding: (workspace) => ({
    workspacePath: workspace?.activeWorkspacePath || '',
    workspaceName: workspace?.activeWorkspaceName || '',
  }),
}));

describe('startNewChatSession', () => {
  beforeEach(() => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('new-chat-ref');
    (DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock).mockReset();
    (setConversationWorkspaceBinding as jest.MockedFunction<typeof setConversationWorkspaceBinding>).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creates a fresh local conversation ref and stores workspace binding', () => {
    const clearMessages = jest.fn();
    const setIsSending = jest.fn();
    const setThinkingStatus = jest.fn();
    const setTokenCounts = jest.fn();

    const conversationRef = startNewChatSession({
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
      workspace: {
        activeWorkspaceName: 'WindieOS',
        activeWorkspacePath: '/work/WindieOS',
      },
    });

    expect(conversationRef).toBe('conv_new-chat-ref');
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).toHaveBeenCalledWith('conv_new-chat-ref', undefined);
    expect(setConversationWorkspaceBinding).toHaveBeenCalledWith('conv_new-chat-ref', {
      workspacePath: '/work/WindieOS',
      workspaceName: 'WindieOS',
    });
  });
});
