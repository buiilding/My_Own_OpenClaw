import { act, renderHook } from '@testing-library/react';

jest.mock('../../frontend/src/renderer/features/chat/session/desktopConversationRuntimeClient', () => ({
  DesktopConversationRuntimeClient: {
    replaceCompactedReplay: jest.fn(() => Promise.resolve()),
  },
}));

import { useChatStreamCompactionHandlers } from '../../frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompactionHandlers';
import { DesktopConversationRuntimeClient } from '../../frontend/src/renderer/features/chat/session/desktopConversationRuntimeClient';
import {
  COMPACTION_COMPLETED_THINKING_STATUS,
  COMPACTION_FAILED_THINKING_STATUS,
  COMPACTION_THINKING_STATUS,
} from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamThinkingStatus';

describe('useChatStreamCompactionHandlers', () => {
  beforeEach(() => {
    jest.mocked(DesktopConversationRuntimeClient.replaceCompactedReplay).mockClear();
  });

  test('updates thinking state for compaction lifecycle events', async () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => false);
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const getThinkingSourceEventType = jest.fn(() => 'context-compaction-started');
    const setCompactionDebugInfo = jest.fn();
    const recordTrackingEvent = jest.fn();
    const persistCompactedReplay = jest.fn(() => Promise.resolve());

    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      setThinkingStatus,
      setThinkingSourceEventType,
      getThinkingSourceEventType,
      setCompactionDebugInfo,
      recordTrackingEvent,
      persistCompactedReplay,
    }));

    await act(async () => {
      result.current.handleContextCompactionStarted({
        type: 'context-compaction-started',
        turn_ref: 'turn-1',
      } as any);
      result.current.handleContextCompactionCompleted({
        type: 'context-compaction-completed',
        id: 'compaction-event-1',
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
    expect(setThinkingStatus).toHaveBeenNthCalledWith(3, null, 'conversation-1');
    expect(setThinkingStatus).toHaveBeenNthCalledWith(4, COMPACTION_FAILED_THINKING_STATUS, 'conversation-1');
    expect(setThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-started', 'conversation-1');
    expect(setThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-completed', 'conversation-1');
    expect(setThinkingSourceEventType).toHaveBeenCalledWith(null, 'conversation-1');
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
    expect(setCompactionDebugInfo).toHaveBeenNthCalledWith(3, null, 'conversation-1');
    expect(setCompactionDebugInfo).toHaveBeenNthCalledWith(4, null, 'conversation-1');
    expect(recordTrackingEvent).toHaveBeenCalledTimes(4);
    expect(persistCompactedReplay).toHaveBeenCalledTimes(1);
    expect(persistCompactedReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'compaction-conversation-1-compaction-event-1',
        conversationRef: 'conversation-1',
        sourceRevisionId: 'rev-compaction-conversation-1-compaction-event-1',
        sourceTurnRef: 'turn-1',
        entries: [
          expect.objectContaining({ message_type: 'context_compaction' }),
          expect.objectContaining({ message_type: 'user_query' }),
        ],
        entryCount: 2,
        complete: true,
      }),
      'user-1',
    );
  });

  test('does not clear non-compaction thinking state for skipped compaction', async () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => false);
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const getThinkingSourceEventType = jest.fn(() => 'tool-call');
    const setCompactionDebugInfo = jest.fn();
    const recordTrackingEvent = jest.fn();
    const persistCompactedReplay = jest.fn(() => Promise.resolve());

    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      setThinkingStatus,
      setThinkingSourceEventType,
      getThinkingSourceEventType,
      setCompactionDebugInfo,
      recordTrackingEvent,
      persistCompactedReplay,
    }));

    await act(async () => {
      result.current.handleContextCompactionCompleted({
        type: 'context-compaction-completed',
        turn_ref: 'turn-1',
        payload: { skipped_reason: 'insufficient-history' },
      } as any);
    });

    expect(getThinkingSourceEventType).toHaveBeenCalledWith('conversation-1');
    expect(setThinkingStatus).not.toHaveBeenCalled();
    expect(setThinkingSourceEventType).not.toHaveBeenCalled();
    expect(setCompactionDebugInfo).toHaveBeenCalledWith(null, 'conversation-1');
    expect(recordTrackingEvent).toHaveBeenCalledWith(
      'context-compaction-completed',
      'turn-1',
      {},
      'conversation-1',
    );
    expect(persistCompactedReplay).not.toHaveBeenCalled();
  });

  test('uses desktop conversation runtime facade for default compaction persistence', async () => {
    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      resolveTargetConversationRef: jest.fn(() => 'conversation-1'),
      shouldIgnoreForStaleTurn: jest.fn(() => false),
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      getThinkingSourceEventType: jest.fn(() => 'context-compaction-started'),
      setCompactionDebugInfo: jest.fn(),
      recordTrackingEvent: jest.fn(),
    }));

    await act(async () => {
      result.current.handleContextCompactionCompleted({
        type: 'context-compaction-completed',
        id: 'compaction-event-2',
        turn_ref: 'turn-2',
        user_id: 'user-2',
        payload: {
          replacement_history_entries: [
            {
              role: 'assistant',
              content: 'summary',
              message_type: 'context_compaction',
            },
          ],
        },
      } as any);
    });

    expect(DesktopConversationRuntimeClient.replaceCompactedReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: 'compaction-conversation-1-compaction-event-2',
        conversationRef: 'conversation-1',
        entryCount: 1,
      }),
      'user-2',
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
