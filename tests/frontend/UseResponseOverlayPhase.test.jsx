import { act, renderHook } from '@testing-library/react';

const mockOn = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (...args) => mockOn(...args),
  },
  ON_CHANNELS: {
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
  },
}));

import { useResponseOverlayPhase } from '../../frontend/src/renderer/features/chat/hooks/useResponseOverlayPhase';

describe('useResponseOverlayPhase', () => {
  beforeEach(() => {
    mockOn.mockReset();
  });

  test('subscribes once and reflects parsed overlay phase updates', () => {
    let listener = null;
    const removeListener = jest.fn();
    mockOn.mockImplementation((_channel, handler) => {
      listener = handler;
      return removeListener;
    });

    const { result, unmount } = renderHook(() => useResponseOverlayPhase());

    expect(result.current).toBe('idle');
    expect(mockOn).toHaveBeenCalledWith('response-overlay-phase', expect.any(Function));

    act(() => {
      listener?.({ phase: 'tool-call' });
    });
    expect(result.current).toBe('tool-call');

    act(() => {
      listener?.({ phase: 'invalid-phase' });
    });
    expect(result.current).toBe('tool-call');

    unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});

