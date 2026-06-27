/**
 * Covers chat stream metadata handlers. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';
import { useChatStreamMetadataHandlers } from '../../src/renderer/features/chat/hooks/chatStream/useChatStreamMetadataHandlers';

function sdkEvent(type: string, payload: Record<string, unknown> = {}) {
  return {
    eventId: `${type}-event`,
    type,
    conversationRef: 'conversation-1',
    turnRef: 'turn-1',
    revisionId: 'rev-1',
    timestamp: '2026-05-24T00:00:00.000Z',
    source: 'backend',
    payload,
  };
}

describe('useChatStreamMetadataHandlers', () => {
  test('routes metadata events to message updaters and tracking', () => {
    const shouldIgnoreForStaleTurn = jest.fn(() => false);
    const updateLastMessageBySender = jest.fn();
    const updateLastAssistantLlmTextMessage = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamMetadataHandlers({
      shouldIgnoreForStaleTurn,
      updateLastMessageBySender,
      updateLastAssistantLlmTextMessage,
      recordTrackingEvent,
    }));

    act(() => {
      result.current.handleSystemPrompt(sdkEvent('system_prompt', { content: 'prompt' }) as any);
      result.current.handleUserMessageFull(sdkEvent('user_message_metadata', { content: 'full user' }) as any);
      result.current.handleAssistantMessageFull(sdkEvent('assistant_message', { content: 'full assistant' }) as any);
      result.current.handleToolSchemas(sdkEvent('tool_schemas_metadata', {
        toolSchemas: [{ type: 'function', name: 'tool-a', parameters: { type: 'object' } }],
      }) as any);
    });

    expect(updateLastMessageBySender).toHaveBeenCalledTimes(3);
    expect(updateLastAssistantLlmTextMessage).toHaveBeenCalledTimes(1);
    expect(updateLastMessageBySender).toHaveBeenLastCalledWith(
      'user',
      expect.objectContaining({
        toolSchemas: [{ type: 'function', function: { name: 'tool-a', parameters: { type: 'object' } } }],
      }),
      expect.objectContaining({
        conversationRef: 'conversation-1',
        turnRef: 'turn-1',
        turnRefForUpdate: 'turn-1',
      }),
      'conversation-1',
    );
    expect(recordTrackingEvent).toHaveBeenCalledTimes(4);
  });

  test('ignores stale-turn metadata events', () => {
    const shouldIgnoreForStaleTurn = jest.fn(() => true);
    const updateLastMessageBySender = jest.fn();
    const updateLastAssistantLlmTextMessage = jest.fn();
    const recordTrackingEvent = jest.fn();

    const { result } = renderHook(() => useChatStreamMetadataHandlers({
      shouldIgnoreForStaleTurn,
      updateLastMessageBySender,
      updateLastAssistantLlmTextMessage,
      recordTrackingEvent,
    }));

    act(() => {
      result.current.handleSystemPrompt(sdkEvent('system_prompt') as any);
      result.current.handleUserMessageFull(sdkEvent('user_message_metadata') as any);
      result.current.handleAssistantMessageFull(sdkEvent('assistant_message') as any);
      result.current.handleToolSchemas(sdkEvent('tool_schemas_metadata') as any);
    });

    expect(updateLastMessageBySender).not.toHaveBeenCalled();
    expect(updateLastAssistantLlmTextMessage).not.toHaveBeenCalled();
    expect(recordTrackingEvent).not.toHaveBeenCalled();
  });
});
