/**
 * Covers chat stream compaction handlers. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

jest.mock('../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient', () => ({
  DesktopLiveTurnRuntimeClient: {
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    replaceCompactedReplay: jest.fn(() => Promise.resolve()),
  },
}));

import { useChatStreamCompactionHandlers } from '../../src/renderer/features/chat/hooks/chatStream/useChatStreamCompactionHandlers';
import { DesktopConversationContinuityService } from '../../src/renderer/app/runtime/desktopConversationContinuityService';
import {
  DesktopChatStreamThinkingRuntime,
} from '../../src/renderer/app/runtime/desktopChatStreamThinkingRuntime';

const {
  getCompactionCompletedThinkingStatus,
  getCompactionFailedThinkingStatus,
  getCompactionStartedThinkingStatus,
} = DesktopChatStreamThinkingRuntime;

function sdkEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId: `${type}-event`,
    type,
    conversationRef: 'conversation-1',
    turnRef: 'turn-1',
    revisionId: 'rev-1',
    timestamp: '2026-05-24T00:00:00.000Z',
    source: 'backend',
    payload: {},
    ...overrides,
  };
}

describe('useChatStreamCompactionHandlers', () => {
  beforeEach(() => {
    jest.mocked(DesktopConversationContinuityService.replaceCompactedReplay).mockClear();
  });

  test('updates thinking state for compaction lifecycle events', async () => {
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const getThinkingSourceEventType = jest.fn(() => 'context-compaction-started');
    const setCompactionDebugInfo = jest.fn();
    const recordTrackingEvent = jest.fn();
    const persistCompactedReplay = jest.fn(() => Promise.resolve());

    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      setThinkingStatus,
      setThinkingSourceEventType,
      getThinkingSourceEventType,
      setCompactionDebugInfo,
      recordTrackingEvent,
      persistCompactedReplay,
    }));

    await act(async () => {
      result.current.handleContextCompactionStarted(sdkEvent('compaction_started') as any);
      result.current.handleContextCompactionCompleted(sdkEvent('compaction_applied', {
        eventId: 'compaction-event-1',
        payload: {
          skippedReason: null,
          summaryText: 'full compacted history',
          replacementHistoryPreview: [
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
          replacementHistoryEntries: [
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
          userId: 'user-1',
        },
      }) as any);
      result.current.handleContextCompactionCompleted(sdkEvent('compaction_skipped', {
        payload: { skippedReason: 'already compact' },
      }) as any);
      result.current.handleContextCompactionFailed(sdkEvent('compaction_failed', {
        payload: { error: '' },
      }) as any);
    });

    expect(setThinkingStatus).toHaveBeenNthCalledWith(1, getCompactionStartedThinkingStatus(), 'conversation-1');
    expect(setThinkingStatus).toHaveBeenNthCalledWith(2, getCompactionCompletedThinkingStatus(), 'conversation-1');
    expect(setThinkingStatus).toHaveBeenNthCalledWith(3, null, 'conversation-1');
    expect(setThinkingStatus).toHaveBeenNthCalledWith(4, getCompactionFailedThinkingStatus(), 'conversation-1');
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
        conversationRef: 'conversation-1',
        generationId: 'compaction-conversation-1-compaction-event-1',
        sourceTurnRef: 'turn-1',
        entries: [
          expect.objectContaining({ message_type: 'context_compaction' }),
          expect.objectContaining({ message_type: 'user_query' }),
        ],
      }),
      'user-1',
    );
  });

  test('does not clear non-compaction thinking state for skipped compaction', async () => {
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const getThinkingSourceEventType = jest.fn(() => 'tool-call');
    const setCompactionDebugInfo = jest.fn();
    const recordTrackingEvent = jest.fn();
    const persistCompactedReplay = jest.fn(() => Promise.resolve());

    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      setThinkingStatus,
      setThinkingSourceEventType,
      getThinkingSourceEventType,
      setCompactionDebugInfo,
      recordTrackingEvent,
      persistCompactedReplay,
    }));

    await act(async () => {
      result.current.handleContextCompactionCompleted(sdkEvent('compaction_skipped', {
        payload: { skippedReason: 'insufficient-history' },
      }) as any);
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

  test('uses desktop conversation continuity service for default compaction persistence', async () => {
    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      setThinkingStatus: jest.fn(),
      setThinkingSourceEventType: jest.fn(),
      getThinkingSourceEventType: jest.fn(() => 'context-compaction-started'),
      setCompactionDebugInfo: jest.fn(),
      recordTrackingEvent: jest.fn(),
    }));

    await act(async () => {
      result.current.handleContextCompactionCompleted(sdkEvent('compaction_applied', {
        eventId: 'compaction-event-2',
        turnRef: 'turn-2',
        revisionId: 'rev-2',
        payload: {
          replacementHistoryEntries: [
            {
              role: 'assistant',
              content: 'summary',
              message_type: 'context_compaction',
            },
          ],
          userId: 'user-2',
        },
      }) as any);
    });

    expect(DesktopConversationContinuityService.replaceCompactedReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRef: 'conversation-1',
        generationId: 'compaction-conversation-1-compaction-event-2',
        sourceRevisionId: 'rev-2',
        sourceTurnRef: 'turn-2',
        entries: [expect.objectContaining({ content: 'summary' })],
      }),
      'user-2',
    );
  });

  test('observes compaction operation ids without stale-turn gating', () => {
    const setThinkingStatus = jest.fn();
    const setThinkingSourceEventType = jest.fn();
    const setCompactionDebugInfo = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamCompactionHandlers({
      setThinkingStatus,
      setThinkingSourceEventType,
      setCompactionDebugInfo,
      recordTrackingEvent,
    }));

    act(() => {
      result.current.handleContextCompactionStarted(sdkEvent('compaction_started') as any);
      result.current.handleContextCompactionCompleted(sdkEvent('compaction_applied') as any);
      result.current.handleContextCompactionFailed(sdkEvent('compaction_failed') as any);
    });

    expect(setThinkingStatus).toHaveBeenCalledWith(getCompactionStartedThinkingStatus(), 'conversation-1');
    expect(setThinkingSourceEventType).toHaveBeenCalledWith('context-compaction-started', 'conversation-1');
    expect(setCompactionDebugInfo).toHaveBeenCalledWith(null, 'conversation-1');
    expect(recordTrackingEvent).toHaveBeenCalledWith(
      'context-compaction-started',
      'turn-1',
      {},
      'conversation-1',
    );
  });
});
