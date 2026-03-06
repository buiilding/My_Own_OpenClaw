import { act, renderHook } from '@testing-library/react';

import {
  IpcBridge,
  ON_CHANNELS,
  SEND_CHANNELS,
} from '../../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useWakewordDetection } from '../../../frontend/src/renderer/features/voice/hooks/useWakewordDetection';

describe('useWakewordDetection', () => {
  const listeners = new Map<string, (data: any) => void>();
  const getChannelHandler = (channel: string) => {
    const handler = listeners.get(channel);
    expect(handler).toEqual(expect.any(Function));
    return handler;
  };
  const getSendCallCount = (channel: string) => (
    (IpcBridge.send as jest.Mock).mock.calls.filter((call) => call[0] === channel).length
  );

  const withMockedMediaDevices = (
    mediaDevices: MediaDevices,
    run: () => Promise<void>,
  ) => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    });
    return run().finally(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: originalMediaDevices,
      });
    });
  };

  const renderEnabledHookAndEmitReady = async () => {
    const rendered = renderHook(
      ({ enabled }) => useWakewordDetection(enabled),
      { initialProps: { enabled: true } },
    );
    const statusHandler = getChannelHandler(ON_CHANNELS.WAKEWORD_STATUS);
    await act(async () => {
      statusHandler?.({ ready: true });
      await Promise.resolve();
    });
    return rendered;
  };

  beforeEach(() => {
    const globalWithWakewordGuard = globalThis as typeof globalThis & {
      __windieWakewordCaptureGuard?: { missingDeviceLocked: boolean; nextRetryAt: number };
    };
    if (!globalWithWakewordGuard.__windieWakewordCaptureGuard) {
      globalWithWakewordGuard.__windieWakewordCaptureGuard = {
        missingDeviceLocked: false,
        nextRetryAt: 0,
      };
    } else {
      globalWithWakewordGuard.__windieWakewordCaptureGuard.missingDeviceLocked = false;
      globalWithWakewordGuard.__windieWakewordCaptureGuard.nextRetryAt = 0;
    }
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

  test('registers listeners without enabling wakeword when disabled', () => {
    renderHook(() => useWakewordDetection(false));

    expect(IpcBridge.on).toHaveBeenCalledWith(
      ON_CHANNELS.WAKEWORD_DETECTED,
      expect.any(Function),
    );
    expect(IpcBridge.on).toHaveBeenCalledWith(
      ON_CHANNELS.WAKEWORD_STATUS,
      expect.any(Function),
    );
    expect(IpcBridge.send).not.toHaveBeenCalledWith(SEND_CHANNELS.WAKEWORD_ENABLE, {});
  });

  test('sends wakeword enable signal on mount when enabled', () => {
    renderHook(() => useWakewordDetection(true));
    expect(IpcBridge.send).toHaveBeenCalledWith(SEND_CHANNELS.WAKEWORD_ENABLE, {});
  });

  test('ignores detection events with invalid confidence payloads', () => {
    const onWakewordDetected = jest.fn();
    renderHook(() => useWakewordDetection(false, onWakewordDetected));

    const handler = getChannelHandler(ON_CHANNELS.WAKEWORD_DETECTED);
    const initialDisableCalls = getSendCallCount(SEND_CHANNELS.WAKEWORD_DISABLE);

    act(() => {
      handler?.({ model: 'jarvis', confidence: 'not-a-number' });
    });

    expect(onWakewordDetected.mock.calls.length).toBe(0);
    expect(getSendCallCount(SEND_CHANNELS.WAKEWORD_DISABLE)).toBe(initialDisableCalls);
  });

  test('triggers callback and disable signal for detections above threshold with cooldown guard', () => {
    const onWakewordDetected = jest.fn();
    renderHook(() => useWakewordDetection(true, onWakewordDetected, { threshold: 0.5 }));

    let now = 5000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    const handler = getChannelHandler(ON_CHANNELS.WAKEWORD_DETECTED);
    const initialDisableCalls = getSendCallCount(SEND_CHANNELS.WAKEWORD_DISABLE);

    act(() => {
      now = 10000;
      handler?.({ model: 'jarvis', confidence: 0.8, score: 0.91 });
      now = 10100;
      handler?.({ model: 'jarvis', confidence: 0.85, score: 0.92 });
    });

    expect(onWakewordDetected).toHaveBeenCalledTimes(1);
    expect(onWakewordDetected).toHaveBeenCalledWith({
      model: 'jarvis',
      confidence: 0.8,
      score: 0.91,
    });
    expect(getSendCallCount(SEND_CHANNELS.WAKEWORD_DISABLE)).toBe(initialDisableCalls + 1);

    nowSpy.mockRestore();
  });

  test('warns when chunk size is normalized', () => {
    renderHook(() => useWakewordDetection(false, undefined, { chunkSize: 1000 }));
    expect(console.warn).toHaveBeenCalledWith(
      '[Wakeword] chunkSize 1000 is not a power of 2, using 1024 instead',
    );
  });

  test('stops late microphone stream when disabled before getUserMedia resolves', async () => {
    let resolveMedia: ((stream: MediaStream) => void) | null = null;
    const pendingMedia = new Promise<MediaStream>((resolve) => {
      resolveMedia = resolve;
    });

    const track = { stop: jest.fn() };
    const lateStream = {
      getTracks: () => [track],
    } as unknown as MediaStream;

    await withMockedMediaDevices(
      { getUserMedia: jest.fn(() => pendingMedia) } as unknown as MediaDevices,
      async () => {
        const { rerender } = await renderEnabledHookAndEmitReady();

        rerender({ enabled: false });

        await act(async () => {
          resolveMedia?.(lateStream);
          await Promise.resolve();
        });

        expect(track.stop).toHaveBeenCalledTimes(1);
      },
    );
  });

  test('keeps local capture errors sticky and avoids immediate retry loops on healthy status updates', async () => {
    const notFoundError = new Error('Requested device not found');
    (notFoundError as Error & { name: string }).name = 'NotFoundError';
    const getUserMedia = jest.fn(async () => {
      throw notFoundError;
    });

    await withMockedMediaDevices(
      { getUserMedia } as unknown as MediaDevices,
      async () => {
        const rendered = await renderEnabledHookAndEmitReady();
        const statusHandler = getChannelHandler(ON_CHANNELS.WAKEWORD_STATUS);

        await act(async () => {
          await Promise.resolve();
        });

        expect(rendered.result.current.error).toContain('Microphone device unavailable');

        await act(async () => {
          statusHandler?.({ ready: true, error: null });
          await Promise.resolve();
        });

        expect(rendered.result.current.error).toContain('Microphone device unavailable');
        expect(getUserMedia).toHaveBeenCalledTimes(1);
      },
    );
  });

  test('does not clear missing-device lock when wakeword is only temporarily suppressed', async () => {
    const notFoundError = new Error('Requested device not found');
    (notFoundError as Error & { name: string }).name = 'NotFoundError';
    const getUserMedia = jest.fn(async () => {
      throw notFoundError;
    });

    await withMockedMediaDevices(
      { getUserMedia } as unknown as MediaDevices,
      async () => {
        const rendered = renderHook(
          ({ enabled, wakewordPreferenceEnabled }) => useWakewordDetection(enabled, undefined, {
            wakewordPreferenceEnabled,
          }),
          { initialProps: { enabled: true, wakewordPreferenceEnabled: true } },
        );
        const statusHandler = getChannelHandler(ON_CHANNELS.WAKEWORD_STATUS);

        await act(async () => {
          statusHandler?.({ ready: true, error: null });
          await Promise.resolve();
        });
        expect(getUserMedia).toHaveBeenCalledTimes(1);

        await act(async () => {
          statusHandler?.({ ready: false, error: null });
          await Promise.resolve();
        });
        await act(async () => {
          statusHandler?.({ ready: true, error: null });
          await Promise.resolve();
        });
        expect(getUserMedia).toHaveBeenCalledTimes(1);

        await act(async () => {
          rendered.rerender({ enabled: false, wakewordPreferenceEnabled: true });
          await Promise.resolve();
        });
        await act(async () => {
          rendered.rerender({ enabled: true, wakewordPreferenceEnabled: true });
          await Promise.resolve();
        });
        await act(async () => {
          statusHandler?.({ ready: true, error: null });
          await Promise.resolve();
        });
        expect(getUserMedia).toHaveBeenCalledTimes(1);
      },
    );
  });

  test('clears missing-device lock when wakeword preference is disabled', async () => {
    const notFoundError = new Error('Requested device not found');
    (notFoundError as Error & { name: string }).name = 'NotFoundError';
    const getUserMedia = jest.fn(async () => {
      throw notFoundError;
    });

    await withMockedMediaDevices(
      { getUserMedia } as unknown as MediaDevices,
      async () => {
        const rendered = renderHook(
          ({ enabled, wakewordPreferenceEnabled }) => useWakewordDetection(enabled, undefined, {
            wakewordPreferenceEnabled,
          }),
          { initialProps: { enabled: true, wakewordPreferenceEnabled: true } },
        );
        const statusHandler = getChannelHandler(ON_CHANNELS.WAKEWORD_STATUS);

        await act(async () => {
          statusHandler?.({ ready: true, error: null });
          await Promise.resolve();
        });
        expect(getUserMedia).toHaveBeenCalledTimes(1);

        await act(async () => {
          rendered.rerender({ enabled: false, wakewordPreferenceEnabled: false });
          await Promise.resolve();
        });
        await act(async () => {
          rendered.rerender({ enabled: true, wakewordPreferenceEnabled: true });
          await Promise.resolve();
        });
        await act(async () => {
          statusHandler?.({ ready: true, error: null });
          await Promise.resolve();
        });
        expect(getUserMedia).toHaveBeenCalledTimes(2);
      },
    );
  });

  test('retries capture after devicechange when an audio input appears', async () => {
    const notFoundError = new Error('Requested device not found');
    (notFoundError as Error & { name: string }).name = 'NotFoundError';
    const getUserMedia = jest
      .fn()
      .mockRejectedValueOnce(notFoundError)
      .mockResolvedValueOnce({
        getTracks: () => [{ stop: jest.fn() }],
      } as unknown as MediaStream);
    let hasAudioInput = false;
    let deviceChangeHandler: (() => void) | null = null;

    await withMockedMediaDevices(
      {
        getUserMedia,
        enumerateDevices: jest.fn(async () => (
          hasAudioInput ? [{ kind: 'audioinput' as MediaDeviceKind }] : []
        )),
        addEventListener: jest.fn((_event, handler: () => void) => {
          deviceChangeHandler = handler;
        }),
        removeEventListener: jest.fn(),
      } as unknown as MediaDevices,
      async () => {
        const rendered = await renderEnabledHookAndEmitReady();
        expect(getUserMedia).toHaveBeenCalledTimes(1);
        expect(rendered.result.current.error).toContain('Microphone device unavailable');

        hasAudioInput = true;
        await act(async () => {
          deviceChangeHandler?.();
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(getUserMedia).toHaveBeenCalledTimes(2);
      },
    );
  });

  test('stops audio safely when stop is triggered multiple times', async () => {
    const track = { stop: jest.fn() };
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;

    const sourceNode = {
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const scriptNode = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
    };
    const closeMock = jest.fn(async () => undefined);
    const fakeAudioContext = {
      state: 'running',
      destination: {},
      createMediaStreamSource: jest.fn(() => sourceNode),
      createScriptProcessor: jest.fn(() => scriptNode),
      close: closeMock,
    };

    const originalAudioContext = (window as any).AudioContext;
    const originalWebkitAudioContext = (window as any).webkitAudioContext;

    await withMockedMediaDevices(
      { getUserMedia: jest.fn(async () => stream) } as unknown as MediaDevices,
      async () => {
        try {
          (window as any).AudioContext = jest.fn(() => fakeAudioContext);
          (window as any).webkitAudioContext = undefined;

          const { rerender, unmount } = await renderEnabledHookAndEmitReady();

          await act(async () => {
            rerender({ enabled: false });
            unmount();
            await Promise.resolve();
          });

          expect(closeMock).toHaveBeenCalledTimes(1);
          expect(track.stop).toHaveBeenCalledTimes(1);
        } finally {
          (window as any).AudioContext = originalAudioContext;
          (window as any).webkitAudioContext = originalWebkitAudioContext;
        }
      },
    );
  });
});
