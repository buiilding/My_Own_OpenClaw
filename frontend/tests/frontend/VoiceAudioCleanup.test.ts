/**
 * Covers voice audio cleanup. behavior in the frontend test suite.
 */

import {
  DesktopVoiceAudioCaptureCleanupRuntime,
} from '../../src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime';

const {
  cleanupAudioCaptureNodes,
  closeAudioContextSafely,
  takeAudioContext,
} = DesktopVoiceAudioCaptureCleanupRuntime;

describe('voice audio cleanup utils', () => {
  test('cleanupAudioCaptureNodes disconnects nodes, clears refs, and stops tracks', () => {
    const stopTrack = jest.fn();
    const processorDisconnect = jest.fn();
    const sourceDisconnect = jest.fn();
    const onmessage = jest.fn();
    const port: { onmessage: ((event: MessageEvent<Float32Array>) => void) | null } = { onmessage };

    const processorNodeRef = {
      current: {
        disconnect: processorDisconnect,
        port,
      } as unknown as AudioWorkletNode,
    };
    const sourceNodeRef = {
      current: {
        disconnect: sourceDisconnect,
      } as unknown as MediaStreamAudioSourceNode,
    };
    const mediaStreamRef = {
      current: {
        getTracks: () => [{ stop: stopTrack }],
      } as unknown as MediaStream,
    };

    cleanupAudioCaptureNodes(processorNodeRef, sourceNodeRef, mediaStreamRef);

    expect(processorDisconnect).toHaveBeenCalledTimes(1);
    expect(onmessage).not.toHaveBeenCalled();
    expect(port.onmessage).toBeNull();
    expect(sourceDisconnect).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(processorNodeRef.current).toBeNull();
    expect(sourceNodeRef.current).toBeNull();
    expect(mediaStreamRef.current).toBeNull();
  });

  test('takeAudioContext returns current context and clears ref', () => {
    const audioContext = { state: 'running' } as unknown as AudioContext;
    const audioContextRef = { current: audioContext };

    const extracted = takeAudioContext(audioContextRef);

    expect(extracted).toBe(audioContext);
    expect(audioContextRef.current).toBeNull();
  });

  test('closeAudioContextSafely ignores expected already-closed errors', async () => {
    const close = jest.fn().mockRejectedValue(new Error('Cannot close a closed AudioContext'));
    const onUnexpected = jest.fn();
    const audioContext = {
      state: 'running',
      close,
    } as unknown as AudioContext;

    await closeAudioContextSafely(audioContext, onUnexpected);

    expect(close).toHaveBeenCalledTimes(1);
    expect(onUnexpected).not.toHaveBeenCalled();
  });

  test('closeAudioContextSafely reports unexpected close errors', async () => {
    const error = new Error('boom');
    const close = jest.fn().mockRejectedValue(error);
    const onUnexpected = jest.fn();
    const audioContext = {
      state: 'running',
      close,
    } as unknown as AudioContext;

    await closeAudioContextSafely(audioContext, onUnexpected);

    expect(onUnexpected).toHaveBeenCalledWith(error);
  });
});
