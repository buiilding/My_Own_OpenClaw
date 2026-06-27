/**
 * Covers wakeword bridge events hook. behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';

const mockListeners = new Map<string, (payload: unknown) => void>();
const mockIpcOn = jest.fn((channel: string, handler: (payload: unknown) => void) => {
  mockListeners.set(channel, handler);
  return jest.fn(() => {
    if (mockListeners.get(channel) === handler) {
      mockListeners.delete(channel);
    }
  });
});

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (...args: [string, (payload: unknown) => void]) => mockIpcOn(...args),
  },
  ON_CHANNELS: {
    WAKEWORD_DETECTED: 'wakeword-detected',
    WAKEWORD_STATUS: 'wakeword-status',
  },
}));

import { useWakewordBridgeEvents } from '../../src/renderer/features/voice/hooks/useWakewordBridgeEvents';

function useHarness({
  enabled,
  onWakewordDetected,
  requestWakewordDisable,
}: {
  enabled: boolean;
  onWakewordDetected: jest.Mock;
  requestWakewordDisable: jest.Mock;
}) {
  const lastDetectionRef = useRef(0);
  const localCaptureErrorRef = useRef(false);
  const onWakewordDetectedRef = useRef(onWakewordDetected);
  onWakewordDetectedRef.current = onWakewordDetected;

  useWakewordBridgeEvents({
    enabled,
    threshold: 0.5,
    cooldownMs: 0,
    lastDetectionRef,
    localCaptureErrorRef,
    onWakewordDetectedRef,
    requestWakewordDisable,
    setIsReady: jest.fn(),
    setError: jest.fn(),
  });
}

describe('useWakewordBridgeEvents', () => {
  beforeEach(() => {
    mockListeners.clear();
    mockIpcOn.mockClear();
  });

  test('ignores late wakeword detections after detection is disabled', () => {
    const onWakewordDetected = jest.fn();
    const requestWakewordDisable = jest.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useHarness({
        enabled,
        onWakewordDetected,
        requestWakewordDisable,
      }),
      { initialProps: { enabled: true } },
    );
    const enabledDetectionHandler = mockListeners.get('wakeword-detected');

    rerender({ enabled: false });

    act(() => {
      enabledDetectionHandler?.({
        model: 'hey-jarvis',
        confidence: 0.99,
        score: 0.99,
      });
    });

    expect(requestWakewordDisable).not.toHaveBeenCalled();
    expect(onWakewordDetected).not.toHaveBeenCalled();
  });
});
