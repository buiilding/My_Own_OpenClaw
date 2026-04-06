import { act, renderHook } from '@testing-library/react';
import { useChatStreamMetadataHandlers } from '../../frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamMetadataHandlers';

describe('useChatStreamMetadataHandlers', () => {
  test('routes metadata events to message updaters and tracking', () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => false);
    const updateLastMessageBySender = jest.fn();
    const updateLastAssistantLlmTextMessage = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamMetadataHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      updateLastMessageBySender,
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
        payload: { tool_schemas: [{ type: 'function', name: 'tool-a', parameters: { type: 'object' } }] },
      } as any);
    });

    expect(updateLastMessageBySender).toHaveBeenCalledTimes(3);
    expect(updateLastAssistantLlmTextMessage).toHaveBeenCalledTimes(1);
    expect(updateLastMessageBySender).toHaveBeenLastCalledWith(
      'user',
      expect.objectContaining({
        toolSchemas: [{ type: 'function', function: { name: 'tool-a', parameters: { type: 'object' } } }],
      }),
      'turn-1',
      'conversation-1',
    );
    expect(recordTrackingEvent).toHaveBeenCalledTimes(4);
  });

  test('ignores stale-turn metadata events', () => {
    const resolveTargetConversationRef = jest.fn(() => 'conversation-1');
    const shouldIgnoreForStaleTurn = jest.fn(() => true);
    const updateLastMessageBySender = jest.fn();
    const updateLastAssistantLlmTextMessage = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamMetadataHandlers({
      resolveTargetConversationRef,
      shouldIgnoreForStaleTurn,
      updateLastMessageBySender,
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
    expect(recordTrackingEvent).not.toHaveBeenCalled();
  });
});
