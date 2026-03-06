const mockOn = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (...args) => mockOn(...args),
  },
  ON_CHANNELS: {
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
  },
}));

import {
  getResponseOverlayPhaseSnapshot,
  subscribeResponseOverlayPhaseStore,
} from '../../frontend/src/renderer/features/chat/utils/overlay/overlayPhaseListener';

describe('overlayPhaseListener', () => {
  beforeEach(() => {
    mockOn.mockReset();
  });

  test('store subscribers receive parsed phase updates', () => {
    let listener = null;
    const removeListener = jest.fn();
    mockOn.mockImplementation((_channel, handler) => {
      listener = handler;
      return removeListener;
    });

    const onStoreChange = jest.fn();
    const unsubscribeStore = subscribeResponseOverlayPhaseStore(onStoreChange);
    expect(typeof getResponseOverlayPhaseSnapshot()).toBe('string');

    listener?.({ phase: 'awaiting-first-chunk' });
    expect(onStoreChange).toHaveBeenCalledTimes(1);
    expect(getResponseOverlayPhaseSnapshot() === 'awaiting-first-chunk').toBe(true);

    listener?.({ phase: 'invalid' });
    expect(onStoreChange).toHaveBeenCalledTimes(1);
    expect(getResponseOverlayPhaseSnapshot() === 'awaiting-first-chunk').toBe(true);

    unsubscribeStore();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  test('unsubscribe is safe when ipc subscription has no cleanup fn', () => {
    mockOn.mockReturnValue(undefined);
    const unsubscribe = subscribeResponseOverlayPhaseStore(jest.fn());
    expect(() => unsubscribe()).not.toThrow();
  });
});

