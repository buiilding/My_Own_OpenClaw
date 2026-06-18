/**
 * Covers new chat session. behavior in the frontend test suite.
 */

import { startNewChatSession } from '../../frontend/src/renderer/features/chat/utils/session/newChatSession';
import { DesktopTranscriptSessionRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopWorkspaceRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient';

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    updateTranscriptSession: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient', () => ({
  DesktopWorkspaceRuntimeClient: {
    setConversationWorkspaceBinding: jest.fn(),
    workspaceSelectionToBinding: (workspace) => ({
      workspacePath: workspace?.activeWorkspacePath || '',
      workspaceName: workspace?.activeWorkspaceName || '',
    }),
  },
}));

describe('startNewChatSession', () => {
  beforeEach(() => {
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('new-chat-ref');
    (DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock).mockReset();
    (DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creates a fresh local conversation ref and stores workspace binding', () => {
    const clearMessages = jest.fn();
    const setIsSending = jest.fn();
    const setThinkingStatus = jest.fn();
    const setTokenCounts = jest.fn();
    const setChatActiveConversationRef = jest.fn();

    const conversationRef = startNewChatSession({
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
      setChatActiveConversationRef,
      workspace: {
        activeWorkspaceName: 'WindieOS',
        activeWorkspacePath: '/work/WindieOS',
      },
    });

    expect(conversationRef).toBe('conv_new-chat-ref');
    expect(DesktopTranscriptSessionRuntimeClient.updateTranscriptSession).toHaveBeenCalledWith('conv_new-chat-ref', undefined);
    expect(setChatActiveConversationRef).toHaveBeenNthCalledWith(1, null);
    expect(setChatActiveConversationRef).toHaveBeenNthCalledWith(2, 'conv_new-chat-ref');
    expect(DesktopWorkspaceRuntimeClient.setConversationWorkspaceBinding).toHaveBeenCalledWith('conv_new-chat-ref', {
      workspacePath: '/work/WindieOS',
      workspaceName: 'WindieOS',
    });
  });

  test('clears the previous active workspace before selecting the fresh conversation', () => {
    const callOrder: string[] = [];
    const clearMessages = jest.fn(() => {
      callOrder.push('clear-active-workspace');
    });
    const setIsSending = jest.fn();
    const setThinkingStatus = jest.fn();
    const setTokenCounts = jest.fn();
    const setChatActiveConversationRef = jest.fn((conversationRef) => {
      callOrder.push(`select:${conversationRef ?? 'null'}`);
    });

    startNewChatSession({
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
      setChatActiveConversationRef,
    });

    expect(callOrder).toEqual([
      'clear-active-workspace',
      'select:null',
      'select:conv_new-chat-ref',
    ]);
  });
});
