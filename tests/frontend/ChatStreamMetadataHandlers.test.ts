import { act, renderHook } from '@testing-library/react';
import { useChatStreamMetadataHandlers } from '../../frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamMetadataHandlers';

describe('useChatStreamMetadataHandlers', () => {
  test('routes metadata events to message updaters and tracking', () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => false);
    const updateLastMessageBySender = jest.fn();
    const updateFirstMessageBySender = jest.fn();
    const updateLastAssistantLlmTextMessage = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamMetadataHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      updateLastMessageBySender,
      updateFirstMessageBySender,
      updateLastAssistantLlmTextMessage,
      recordTrackingEvent,
    }));

    act(() => {
      result.current.handleSystemPrompt({
        type: 'system-prompt',
        turn_ref: 'turn-1',
        payload: { content: 'prompt' },
      } as any);
      result.current.handleUserMessageFull({
        type: 'user-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'full user' },
      } as any);
      result.current.handleAssistantMessageFull({
        type: 'assistant-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'full assistant' },
      } as any);
      result.current.handleToolSchemas({
        type: 'tool-schemas',
        turn_ref: 'turn-1',
        payload: { tool_schemas: [{ name: 'tool-a' }] },
      } as any);
    });

    expect(updateLastMessageBySender).toHaveBeenCalledTimes(2);
    expect(updateLastAssistantLlmTextMessage).toHaveBeenCalledTimes(1);
    expect(updateFirstMessageBySender).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ toolSchemas: [{ name: 'tool-a' }] }),
      'conversation-1',
    );
    expect(recordTrackingEvent).toHaveBeenCalledTimes(4);
  });

  test('ignores stale-turn metadata events', () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => true);
    const updateLastMessageBySender = jest.fn();
    const updateFirstMessageBySender = jest.fn();
    const updateLastAssistantLlmTextMessage = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamMetadataHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      updateLastMessageBySender,
      updateFirstMessageBySender,
      updateLastAssistantLlmTextMessage,
      recordTrackingEvent,
    }));

    act(() => {
      result.current.handleSystemPrompt({ type: 'system-prompt' } as any);
      result.current.handleUserMessageFull({ type: 'user-message-full' } as any);
      result.current.handleAssistantMessageFull({ type: 'assistant-message-full' } as any);
      result.current.handleToolSchemas({ type: 'tool-schemas' } as any);
    });

    expect(updateLastMessageBySender).not.toHaveBeenCalled();
    expect(updateLastAssistantLlmTextMessage).not.toHaveBeenCalled();
    expect(updateFirstMessageBySender).not.toHaveBeenCalled();
    expect(recordTrackingEvent).not.toHaveBeenCalled();
  });
});
