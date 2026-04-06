import { startNewChatSession } from '../../frontend/src/renderer/features/chat/utils/session/newChatSession';
import {
  setActiveConversationRef,
  updateTranscriptSession,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';
import {
  clearConversationBackendSyncState,
  markConversationBackendStateFreshLocal,
} from '../../frontend/src/renderer/features/chat/session/conversationBackendSyncRuntime';
import {
  setConversationWorkspaceBinding,
} from '../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  setActiveConversationRef: jest.fn(),
  updateTranscriptSession: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/features/chat/session/conversationBackendSyncRuntime', () => ({
  clearConversationBackendSyncState: jest.fn(),
  markConversationBackendStateFreshLocal: jest.fn(),
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
    (setActiveConversationRef as jest.MockedFunction<typeof setActiveConversationRef>).mockReset();
    (updateTranscriptSession as jest.MockedFunction<typeof updateTranscriptSession>).mockReset();
    (clearConversationBackendSyncState as jest.MockedFunction<typeof clearConversationBackendSyncState>).mockReset();
    (markConversationBackendStateFreshLocal as jest.MockedFunction<typeof markConversationBackendStateFreshLocal>).mockReset();
    (setConversationWorkspaceBinding as jest.MockedFunction<typeof setConversationWorkspaceBinding>).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creates a fresh local conversation ref and marks it unsynced for backend lazy hydrate', () => {
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
    expect(setActiveConversationRef).toHaveBeenCalledWith('conv_new-chat-ref');
    expect(setConversationWorkspaceBinding).toHaveBeenCalledWith('conv_new-chat-ref', {
      workspacePath: '/work/WindieOS',
      workspaceName: 'WindieOS',
    });
    expect(markConversationBackendStateFreshLocal).toHaveBeenCalledWith('conv_new-chat-ref');
  });
});
