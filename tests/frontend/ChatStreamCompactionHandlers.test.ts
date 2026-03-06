import { act, renderHook } from '@testing-library/react';
import { useChatStreamCompactionHandlers } from '../../frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompactionHandlers';
import {
  COMPACTION_COMPLETED_NO_CHANGES_THINKING_STATUS,
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
  COMPACTION_THINKING_STATUS,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamThinkingStatus';

describe('useChatStreamCompactionHandlers', () => {
  test('updates thinking state for compaction lifecycle events', () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => false);
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      setThinkingStatus,
      setThinkingSourceEventType,
      recordTrackingEvent,
    }));

    act(() => {
      result.current.handleContextCompactionStarted({
        type: 'context-compaction-started',
        turn_ref: 'turn-1',
      } as any);
      result.current.handleContextCompactionCompleted({
        type: 'context-compaction-completed',
        turn_ref: 'turn-1',
        payload: { skipped_reason: '' },
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
    expect(recordTrackingEvent).toHaveBeenCalledTimes(4);
  });

  test('ignores stale-turn events', () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => true);
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      setThinkingStatus,
      setThinkingSourceEventType,
      recordTrackingEvent,
    }));

    act(() => {
      result.current.handleContextCompactionStarted({ type: 'context-compaction-started' } as any);
      result.current.handleContextCompactionCompleted({ type: 'context-compaction-completed' } as any);
      result.current.handleContextCompactionFailed({ type: 'context-compaction-failed' } as any);
    });

    expect(setThinkingStatus).not.toHaveBeenCalled();
    expect(setThinkingSourceEventType).not.toHaveBeenCalled();
    expect(recordTrackingEvent).not.toHaveBeenCalled();
  });
});
