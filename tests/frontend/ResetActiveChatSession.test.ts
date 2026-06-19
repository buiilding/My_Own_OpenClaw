/**
 * Covers reset active chat session behavior in the frontend test suite.
 */

import { resetActiveChatSession } from '../../frontend/src/renderer/app/runtime/desktopActiveChatSessionRuntime';
import { DesktopTranscriptSessionRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    updateTranscriptSession: jest.fn(),
  },
}));

const mockUpdateTranscriptSession = DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock;

describe('resetActiveChatSession', () => {
  beforeEach(() => {
    mockUpdateTranscriptSession.mockReset();
  });

  test('clears transcript and chat workspace state for the provided conversation', () => {
    const clearMessages = jest.fn();
    const setIsSending = jest.fn();
    const setThinkingStatus = jest.fn();
    const setTokenCounts = jest.fn();
    const setChatActiveConversationRef = jest.fn();

    resetActiveChatSession({
      conversationRef: 'conv-1',
      userId: 'user-1',
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
      setChatActiveConversationRef,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(null, 'user-1');
    expect(clearMessages).toHaveBeenCalledWith('conv-1');
    expect(setIsSending).toHaveBeenCalledWith(false, 'conv-1');
    expect(setThinkingStatus).toHaveBeenCalledWith(null, 'conv-1');
    expect(setTokenCounts).toHaveBeenCalledWith(null, 'conv-1');
    expect(setChatActiveConversationRef).toHaveBeenCalledWith(null);
  });

  test('preserves the existing transcript user when no explicit user id is provided', () => {
    const clearMessages = jest.fn();
    const setIsSending = jest.fn();
    const setThinkingStatus = jest.fn();
    const setTokenCounts = jest.fn();

    resetActiveChatSession({
      clearMessages,
      setIsSending,
      setThinkingStatus,
      setTokenCounts,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(null, undefined);
    expect(clearMessages).toHaveBeenCalledWith(null);
    expect(setIsSending).toHaveBeenCalledWith(false, null);
    expect(setThinkingStatus).toHaveBeenCalledWith(null, null);
    expect(setTokenCounts).toHaveBeenCalledWith(null, null);
  });
});
