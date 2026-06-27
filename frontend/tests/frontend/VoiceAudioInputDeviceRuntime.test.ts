/**
 * Covers voice audio input device runtime behavior in the frontend test suite.
 */

import { DesktopVoiceAudioInputDeviceRuntime } from '../../src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime';

describe('DesktopVoiceAudioInputDeviceRuntime', () => {
  const withMediaDevices = async (
    mediaDevices: Partial<MediaDevices> | null,
    run: () => Promise<void> | void,
  ) => {
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    });

    try {
      await run();
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: originalMediaDevices,
      });
    }
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('requests audio input stream with normalized capture constraints', async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = jest.fn(async () => stream);

    await withMediaDevices({ getUserMedia } as Partial<MediaDevices>, async () => {
      const result = await DesktopVoiceAudioInputDeviceRuntime.requestAudioInputStream({
        sampleRate: 16000,
        autoGainControl: true,
      });

      expect(result).toBe(stream);
      expect(getUserMedia).toHaveBeenCalledWith({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    });
  });

  test('creates audio context through the browser audio adapter', () => {
    const audioContext = { sampleRate: 16000 } as unknown as AudioContext;
    const originalAudioContext = (window as any).AudioContext;
    const originalWebkitAudioContext = (window as any).webkitAudioContext;

    try {
      (window as any).AudioContext = undefined;
      (window as any).webkitAudioContext = jest.fn(() => audioContext);

      expect(DesktopVoiceAudioInputDeviceRuntime.createAudioInputContext({ sampleRate: 16000 }))
        .toBe(audioContext);
      expect((window as any).webkitAudioContext).toHaveBeenCalledWith({ sampleRate: 16000 });
    } finally {
      (window as any).AudioContext = originalAudioContext;
      (window as any).webkitAudioContext = originalWebkitAudioContext;
    }
  });

  test('detects available audio input devices', async () => {
    const enumerateDevices = jest.fn(async () => [
      { kind: 'videoinput' as MediaDeviceKind },
      { kind: 'audioinput' as MediaDeviceKind },
    ]);

    await withMediaDevices({ enumerateDevices } as Partial<MediaDevices>, async () => {
      await expect(DesktopVoiceAudioInputDeviceRuntime.hasAvailableAudioInputDevice())
        .resolves.toBe(true);
    });
  });

  test('subscribes and cleans up audio input devicechange listeners', async () => {
    const handler = jest.fn();
    let subscribedListener: EventListener | null = null;
    const addEventListener = jest.fn((_event: string, listener: EventListener) => {
      subscribedListener = listener;
    });
    const removeEventListener = jest.fn();

    await withMediaDevices(
      { addEventListener, removeEventListener } as Partial<MediaDevices>,
      async () => {
        const unsubscribe = DesktopVoiceAudioInputDeviceRuntime.onAudioInputDeviceChange(handler);

        expect(addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
        subscribedListener?.({} as Event);
        expect(handler).toHaveBeenCalledTimes(1);

        unsubscribe?.();
        expect(removeEventListener).toHaveBeenCalledWith('devicechange', subscribedListener);
      },
    );
  });

  test('returns no audio device subscription when media devices are unavailable', async () => {
    await withMediaDevices(null, async () => {
      expect(DesktopVoiceAudioInputDeviceRuntime.onAudioInputDeviceChange(jest.fn()))
        .toBeUndefined();
    });
  });
});
