import { act, renderHook } from '@testing-library/react';

import {
  IpcBridge,
  ON_CHANNELS,
  SEND_CHANNELS,
} from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useWakewordDetection } from '../../frontend/src/renderer/features/voice/hooks/useWakewordDetection';

describe('useWakewordDetection', () => {
  const listeners = new Map<string, (data: any) => void>();

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    listeners.clear();

    jest.spyOn(IpcBridge, 'send').mockImplementation(() => undefined);
    jest.spyOn(IpcBridge, 'on').mockImplementation((channel: any, handler: any) => {
      listeners.set(channel, handler);
      return () => {
        listeners.delete(channel);
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('registers listeners and sends wakeword enable signal on mount', () => {
    renderHook(() => useWakewordDetection(false));

    expect(IpcBridge.on).toHaveBeenCalledWith(
      ON_CHANNELS.WAKEWORD_DETECTED,
      expect.any(Function),
    );
    expect(IpcBridge.on).toHaveBeenCalledWith(
      ON_CHANNELS.WAKEWORD_STATUS,
      expect.any(Function),
    );
    expect(IpcBridge.send).toHaveBeenCalledWith(SEND_CHANNELS.WAKEWORD_ENABLE);
  });

  test('ignores detection events with invalid confidence payloads', () => {
    const onWakewordDetected = jest.fn();
    renderHook(() => useWakewordDetection(false, onWakewordDetected));

    const handler = listeners.get(ON_CHANNELS.WAKEWORD_DETECTED);
    expect(handler).toEqual(expect.any(Function));
    const initialDisableCalls = (IpcBridge.send as jest.Mock).mock.calls.filter(
      (call) => call[0] === SEND_CHANNELS.WAKEWORD_DISABLE,
    ).length;

    act(() => {
      handler?.({ model: 'jarvis', confidence: 'not-a-number' });
    });

    expect(onWakewordDetected.mock.calls.length).toBe(0);
    const disableCalls = (IpcBridge.send as jest.Mock).mock.calls.filter(
      (call) => call[0] === SEND_CHANNELS.WAKEWORD_DISABLE,
    );
    expect(disableCalls.length).toBe(initialDisableCalls);
  });

  test('triggers callback and disable signal for detections above threshold with cooldown guard', () => {
    const onWakewordDetected = jest.fn();
    renderHook(() => useWakewordDetection(true, onWakewordDetected, { threshold: 0.5 }));

    let now = 5000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    const handler = listeners.get(ON_CHANNELS.WAKEWORD_DETECTED);
    expect(handler).toEqual(expect.any(Function));
    const initialDisableCalls = (IpcBridge.send as jest.Mock).mock.calls.filter(
      (call) => call[0] === SEND_CHANNELS.WAKEWORD_DISABLE,
    ).length;

    act(() => {
      now = 10000;
      handler?.({ model: 'jarvis', confidence: 0.8, score: 0.91 });
      now = 10100;
      handler?.({ model: 'jarvis', confidence: 0.85, score: 0.92 });
    });

    expect(onWakewordDetected.mock.calls.length > 0).toBe(true);
    expect(onWakewordDetected.mock.calls[0][0]).toEqual({
      model: 'jarvis',
      confidence: 0.8,
      score: 0.91,
    });
    const disableCalls = (IpcBridge.send as jest.Mock).mock.calls.filter(
      (call) => call[0] === SEND_CHANNELS.WAKEWORD_DISABLE,
    );
    expect(disableCalls.length).toBe(initialDisableCalls + 1);

    nowSpy.mockRestore();
  });

  test('warns when chunk size is normalized', () => {
    renderHook(() => useWakewordDetection(false, undefined, { chunkSize: 1000 }));
    expect(console.warn).toHaveBeenCalledWith(
      '[Wakeword] chunkSize 1000 is not a power of 2, using 1024 instead',
    );
  });
});
