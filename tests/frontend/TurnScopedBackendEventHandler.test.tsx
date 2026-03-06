import { renderHook } from '@testing-library/react';
import { useTurnScopedBackendEventHandler } from '../../frontend/src/renderer/features/chat/hooks/chatStream/useTurnScopedBackendEventHandler';

describe('useTurnScopedBackendEventHandler', () => {
  test('filters stale-turn events by default', () => {
    const onEvent = jest.fn();
    const { result } = renderHook(() => useTurnScopedBackendEventHandler({
      resolveTargetConversationRef: () => 'conv-1',
      shouldIgnoreForStaleTurn: () => true,
      onEvent,
    }));

    result.current({ type: 'tool-call', payload: {}, turn_ref: 'turn-1' } as any);
    expect(onEvent).not.toHaveBeenCalled();
  });

  test('forwards event with resolved conversation when not stale', () => {
    const onEvent = jest.fn();
    const { result } = renderHook(() => useTurnScopedBackendEventHandler({
      resolveTargetConversationRef: () => 'conv-2',
      shouldIgnoreForStaleTurn: () => false,
      onEvent,
    }));

    const event = { type: 'token-count', payload: {}, turn_ref: 'turn-2' } as any;
    result.current(event);
    expect(onEvent).toHaveBeenCalledWith(event, 'conv-2');
  });

  test('can skip stale-turn gate for passthrough events', () => {
    const onEvent = jest.fn();
    const shouldIgnoreForStaleTurn = jest.fn(() => true);
    const { result } = renderHook(() => useTurnScopedBackendEventHandler({
      resolveTargetConversationRef: () => 'conv-3',
      shouldIgnoreForStaleTurn,
      onEvent,
      skipStaleTurnGate: true,
    }));

    const event = { type: 'local-user-message', payload: {} } as any;
    result.current(event);
    expect(onEvent).toHaveBeenCalledWith(event, 'conv-3');
    expect(shouldIgnoreForStaleTurn).not.toHaveBeenCalled();
  });

  test('passes resolved conversation ref to stale-turn guard', () => {
    const onEvent = jest.fn();
    const shouldIgnoreForStaleTurn = jest.fn(() => false);
    const { result } = renderHook(() => useTurnScopedBackendEventHandler({
      resolveTargetConversationRef: () => 'conv-4',
      shouldIgnoreForStaleTurn,
      onEvent,
    }));

    const event = { type: 'tool-output', payload: {}, turn_ref: 'turn-4' } as any;
    result.current(event);

    expect(shouldIgnoreForStaleTurn).toHaveBeenCalledWith(event, 'conv-4');
    expect(onEvent).toHaveBeenCalledWith(event, 'conv-4');
  });
});
