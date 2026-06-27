/**
 * Covers reset active chat session behavior in the frontend test suite.
 */

import { DesktopActiveChatSessionRuntime } from '../../src/renderer/app/runtime/desktopActiveChatSessionRuntime';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    updateTranscriptSession: jest.fn(),
  },
}));

const mockUpdateTranscriptSession = DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock;
const {
  resetActiveChatSession,
} = DesktopActiveChatSessionRuntime;

describe('resetActiveChatSession', () => {
  beforeEach(() => {
    mockUpdateTranscriptSession.mockReset();
  });

  test('clears transcript and chat workspace state for the provided conversation', () => {
    const clearMessages = jest.fn();
    const setThinkingStatus = jest.fn();
    const setTokenCounts = jest.fn();
    const setChatActiveConversationRef = jest.fn();

    resetActiveChatSession({
      conversationRef: 'conv-1',
      userId: 'user-1',
      clearMessages,
      setThinkingStatus,
      setTokenCounts,
      setChatActiveConversationRef,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(null, 'user-1');
    expect(clearMessages).toHaveBeenCalledWith('conv-1');
    expect(setThinkingStatus).toHaveBeenCalledWith(null, 'conv-1');
    expect(setTokenCounts).toHaveBeenCalledWith(null, 'conv-1');
    expect(setChatActiveConversationRef).toHaveBeenCalledWith(null);
  });

  test('preserves the existing transcript user when no explicit user id is provided', () => {
    const clearMessages = jest.fn();
    const setThinkingStatus = jest.fn();
    const setTokenCounts = jest.fn();

    resetActiveChatSession({
      clearMessages,
      setThinkingStatus,
      setTokenCounts,
    });

    expect(mockUpdateTranscriptSession).toHaveBeenCalledWith(null, undefined);
    expect(clearMessages).toHaveBeenCalledWith(null);
    expect(setThinkingStatus).toHaveBeenCalledWith(null, null);
    expect(setTokenCounts).toHaveBeenCalledWith(null, null);
  });
});
