import { act, renderHook } from '@testing-library/react';
import { useChatStreamCompactionHandlers } from '../../frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompactionHandlers';
import {
  COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS,
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
  COMPACTION_THINKING_STATUS,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamThinkingStatus';

const mockReplaceConversationReplayState = jest.fn(() => Promise.resolve());

jest.mock('../../frontend/src/renderer/infrastructure/transcript/conversationReplayState', () => ({
  replaceConversationReplayState: (...args: any[]) => mockReplaceConversationReplayState(...args),
}));

jest.mock('../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding', () => ({
  getConversationWorkspaceBinding: jest.fn(() => ({
    workspacePath: '/workspace',
    workspaceName: 'WindieOS',
  })),
}));

describe('useChatStreamCompactionHandlers', () => {
  beforeEach(() => {
    mockReplaceConversationReplayState.mockClear();
  });

  test('updates thinking state for compaction lifecycle events', async () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => false);
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const setCompactionDebugInfo = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      setThinkingStatus,
      setThinkingSourceEventType,
      setCompactionDebugInfo,
      recordTrackingEvent,
    }));

    await act(async () => {
      result.current.handleContextCompactionStarted({
        type: 'context-compaction-started',
        turn_ref: 'turn-1',
      } as any);
      result.current.handleContextCompactionCompleted({
        type: 'context-compaction-completed',
        turn_ref: 'turn-1',
        user_id: 'user-1',
        payload: {
          skipped_reason: '',
          summary_text: 'full compacted history',
          replacement_history_preview: [
            {
              role: 'assistant',
              message_type: 'context_compaction',
              content: '[[CONTEXT COMPACTION SUMMARY]]\nfull compacted history',
            },
            {
              role: 'user',
              message_type: 'user_query',
              content: 'latest question',
            },
          ],
          replacement_history_entries: [
            {
              role: 'assistant',
              content: '[[CONTEXT COMPACTION SUMMARY]]\nfull compacted history',
              message_type: 'context_compaction',
            },
            {
              role: 'user',
              content: 'latest question',
              message_type: 'user_query',
            },
          ],
        },
      } as any);
      result.current.handleContextCompactionCompleted({
        type: 'context-compaction-completed',
        turn_ref: 'turn-1',
        payload: { skipped_reason: 'already compact' },
      } as any);
      result.current.handleContextCompactionFailed({
        type: 'context-compaction-failed',
        turn_ref: 'turn-1',
        payload: { error: '' },
      } as any);
    });

    expect(setThinkingStatus).toHaveBeenNthCalledWith(1, COMPACTION_THINKING_STATUS, 'conversation-1');
    expect(setThinkingStatus).toHaveBeenNthCalledWith(2, COMPACTION_COMPLETED_THINKING_STATUS, 'conversation-1');
    expect(setThinkingStatus).toHaveBeenNthCalledWith(3, COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS, 'conversation-1');
    expect(setThinkingStatus).toHaveBeenNthCalledWith(4, COMPACTION_FAILED_THINKING_STATUS, 'conversation-1');
    expect(setThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-started', 'conversation-1');
    expect(setThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-completed', 'conversation-1');
    expect(setThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-failed', 'conversation-1');
    expect(setCompactionDebugInfo).toHaveBeenNthCalledWith(1, null, 'conversation-1');
    expect(setCompactionDebugInfo).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        summaryText: 'full compacted history',
        replacementHistoryPreview: [
          expect.objectContaining({ messageType: 'context_compaction' }),
          expect.objectContaining({ messageType: 'user_query' }),
        ],
      }),
      'conversation-1',
    );
    expect(setCompactionDebugInfo).toHaveBeenNthCalledWith(4, null, 'conversation-1');
    expect(recordTrackingEvent).toHaveBeenCalledTimes(4);
    expect(mockReplaceConversationReplayState).toHaveBeenCalledTimes(1);
    expect(mockReplaceConversationReplayState).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRef: 'conversation-1',
        userId: 'user-1',
      }),
      [
        expect.objectContaining({
          messageIndex: 1,
          rehydrateEntry: expect.objectContaining({ message_type: 'context_compaction' }),
        }),
        expect.objectContaining({
          messageIndex: 2,
          rehydrateEntry: expect.objectContaining({ message_type: 'user_query' }),
        }),
      ],
    );
  });

  test('ignores stale-turn events', () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => true);
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const setCompactionDebugInfo = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      setThinkingStatus,
      setThinkingSourceEventType,
      setCompactionDebugInfo,
      recordTrackingEvent,
    }));

    act(() => {
      result.current.handleContextCompactionStarted({ type: 'context-compaction-started' } as any);
      result.current.handleContextCompactionCompleted({ type: 'context-compaction-completed' } as any);
      result.current.handleContextCompactionFailed({ type: 'context-compaction-failed' } as any);
    });

    expect(setThinkingStatus).not.toHaveBeenCalled();
    expect(setThinkingSourceEventType).not.toHaveBeenCalled();
    expect(setCompactionDebugInfo).not.toHaveBeenCalled();
    expect(recordTrackingEvent).not.toHaveBeenCalled();
  });
});
