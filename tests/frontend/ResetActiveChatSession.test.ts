import { resetActiveChatSession } from '../../frontend/src/renderer/features/chat/utils/session/resetActiveChatSession';
import {
  updateTranscriptSession,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';
import { clearConversationInferenceSessionState } from '../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime';

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  updateTranscriptSession: jest.fn(),
}));

jest.mock('../../frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime', () => ({
  clearConversationInferenceSessionState: jest.fn(),
}));

const mockUpdateTranscriptSession = updateTranscriptSession as jest.MockedFunction<typeof updateTranscriptSession>;
const mockClearConversationInferenceSessionState = clearConversationInferenceSessionState as jest.MockedFunction<typeof clearConversationInferenceSessionState>;

describe('resetActiveChatSession', () => {
  beforeEach(() => {
    mockUpdateTranscriptSession.mockReset();
    mockClearConversationInferenceSessionState.mockReset();
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
    expect(mockClearConversationInferenceSessionState).toHaveBeenCalledWith('conv-1');
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
    expect(mockClearConversationInferenceSessionState).toHaveBeenCalledWith(null);
    expect(clearMessages).toHaveBeenCalledWith(null);
    expect(setIsSending).toHaveBeenCalledWith(false, null);
    expect(setThinkingStatus).toHaveBeenCalledWith(null, null);
    expect(setTokenCounts).toHaveBeenCalledWith(null, null);
  });
});
