import { startNewChatSession } from '../../frontend/src/renderer/features/chat/utils/session/newChatSession';
import {
  updateTranscriptSession,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';
import {
  clearConversationInferenceSessionState,
  markConversationInferenceSessionLocalOnly,
} from '../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime';
import {
  setConversationWorkspaceBinding,
} from '../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  updateTranscriptSession: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime', () => ({
  clearConversationInferenceSessionState: jest.fn(),
  markConversationInferenceSessionLocalOnly: jest.fn(),
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
    (updateTranscriptSession as jest.MockedFunction<typeof updateTranscriptSession>).mockReset();
    (clearConversationInferenceSessionState as jest.MockedFunction<typeof clearConversationInferenceSessionState>).mockReset();
    (markConversationInferenceSessionLocalOnly as jest.MockedFunction<typeof markConversationInferenceSessionLocalOnly>).mockReset();
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
    expect(updateTranscriptSession).toHaveBeenCalledWith('conv_new-chat-ref', undefined);
    expect(setConversationWorkspaceBinding).toHaveBeenCalledWith('conv_new-chat-ref', {
      workspacePath: '/work/WindieOS',
      workspaceName: 'WindieOS',
    });
    expect(markConversationInferenceSessionLocalOnly).toHaveBeenCalledWith('conv_new-chat-ref');
  });
});
