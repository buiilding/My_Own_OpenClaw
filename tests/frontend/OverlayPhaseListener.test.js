const mockOn = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (...args) => mockOn(...args),
  },
  ON_CHANNELS: {
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
  },
}));

import { subscribeResponseOverlayPhase } from '../../frontend/src/renderer/features/chat/utils/overlayPhaseListener';

describe('overlayPhaseListener', () => {
  beforeEach(() => {
    mockOn.mockReset();
  });

  test('subscribes to response-overlay-phase and forwards valid phase strings', () => {
    let listener = null;
    const removeListener = jest.fn();
    mockOn.mockImplementation((_channel, handler) => {
      listener = handler;
      return removeListener;
    });

    const onPhase = jest.fn();
    const unsubscribe = subscribeResponseOverlayPhase(onPhase);

    expect(mockOn).toHaveBeenCalledWith('response-overlay-phase', expect.any(Function));

    listener?.({
      phase: 'streaming',
      source: 'backend',
      correlation_id: 'req-1',
      attempt: 1,
      max_attempts: 5,
      recovery_stage: 'tool-output',
      failure_reason: 'focus_retrying',
    });
    listener?.({ phase: 'complete' });
    listener?.({ phase: 'unknown-phase' });
    listener?.({ phase: 'error', attempt: Infinity });
    listener?.({ phase: 7 });
    listener?.({});
    listener?.(null);

    expect(onPhase).toHaveBeenCalledTimes(3);
    expect(onPhase).toHaveBeenNthCalledWith(
      1,
      'streaming',
      {
        phase: 'streaming',
        source: 'backend',
        correlation_id: 'req-1',
        attempt: 1,
        max_attempts: 5,
        recovery_stage: 'tool-output',
        failure_reason: 'focus_retrying',
      },
    );
    expect(onPhase).toHaveBeenNthCalledWith(
      2,
      'complete',
      expect.objectContaining({ phase: 'complete' }),
    );
    expect(onPhase).toHaveBeenNthCalledWith(
      3,
      'error',
      expect.objectContaining({
        phase: 'error',
        attempt: undefined,
      }),
    );

    unsubscribe();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  test('unsubscribe is safe when ipc subscription has no cleanup fn', () => {
    mockOn.mockReturnValue(undefined);
    const unsubscribe = subscribeResponseOverlayPhase(jest.fn());
    expect(() => unsubscribe()).not.toThrow();
  });
});
