/**
 * Covers voice mode hook. behavior in the frontend test suite.
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { useAudioCaptureRefs } from '../../src/renderer/features/voice/hooks/useAudioCaptureRefs';
import { useVoiceMode } from '../../src/renderer/features/voice/hooks/useVoiceMode';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitJson(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  emitRaw(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('useVoiceMode', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    MockWebSocket.instances = [];
    (global as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('uses latest transcription callback without creating a new websocket', () => {
    const onTranscriptionUpdateA = jest.fn();
    const onTranscriptionUpdateB = jest.fn();

    const { rerender } = renderHook(
      ({ onTranscriptionUpdate }) =>
        useVoiceMode(true, onTranscriptionUpdate, undefined, 'ws://localhost:5026'),
      { initialProps: { onTranscriptionUpdate: onTranscriptionUpdateA } },
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.emitJson({ type: 'realtime', text: 'first', is_final: false });
    });
    expect(onTranscriptionUpdateA).toHaveBeenCalledWith('first', false);

    rerender({ onTranscriptionUpdate: onTranscriptionUpdateB });

    act(() => {
      socket.emitJson({ type: 'realtime', text: 'second', is_final: true });
    });
    expect(onTranscriptionUpdateB).toHaveBeenCalledWith('second', true);
    expect(onTranscriptionUpdateA).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  test('uses latest utterance-end callback without creating a new websocket', () => {
    const onUtteranceEndA = jest.fn();
    const onUtteranceEndB = jest.fn();

    const { rerender } = renderHook(
      ({ onUtteranceEnd }) =>
        useVoiceMode(true, undefined, onUtteranceEnd, 'ws://localhost:5026'),
      { initialProps: { onUtteranceEnd: onUtteranceEndA } },
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.emitJson({ type: 'utterance_end' });
    });
    expect(onUtteranceEndA).toHaveBeenCalledTimes(1);

    rerender({ onUtteranceEnd: onUtteranceEndB });

    act(() => {
      socket.emitJson({ type: 'utterance_end' });
    });
    expect(onUtteranceEndB).toHaveBeenCalledTimes(1);
    expect(onUtteranceEndA).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  test('sends language payload when websocket opens', () => {
    renderHook(() => useVoiceMode(true, undefined, undefined, 'ws://localhost:5026'));

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.readyState = MockWebSocket.OPEN;
      socket.onopen?.({} as Event);
    });

    expect(socket.send).toHaveBeenCalledWith(
      '{"type":"set_langs","source_language":"en","target_language":"en"}',
    );
  });

  test('does not replace a connecting websocket during rerenders', () => {
    const { rerender } = renderHook(
      ({ gatewayUrl }) =>
        useVoiceMode(true, undefined, undefined, gatewayUrl),
      { initialProps: { gatewayUrl: 'ws://localhost:5026' } },
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances[0];
    expect(socket.readyState).toBe(MockWebSocket.CONNECTING);

    rerender({ gatewayUrl: 'ws://localhost:5027' });
    rerender({ gatewayUrl: 'ws://localhost:5028' });

    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => {
      socket.readyState = MockWebSocket.OPEN;
      socket.onopen?.({} as Event);
    });
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith(
      '{"type":"set_langs","source_language":"en","target_language":"en"}',
    );
  });

  test('keeps audio capture ref setter identities stable across rerenders', () => {
    const { result, rerender } = renderHook(() => useAudioCaptureRefs());
    const firstSetters = {
      setMediaStreamRef: result.current.setMediaStreamRef,
      setAudioContextRef: result.current.setAudioContextRef,
      setSourceNodeRef: result.current.setSourceNodeRef,
      setProcessorNodeRef: result.current.setProcessorNodeRef,
    };

    rerender();

    expect(result.current.setMediaStreamRef).toBe(firstSetters.setMediaStreamRef);
    expect(result.current.setAudioContextRef).toBe(firstSetters.setAudioContextRef);
    expect(result.current.setSourceNodeRef).toBe(firstSetters.setSourceNodeRef);
    expect(result.current.setProcessorNodeRef).toBe(firstSetters.setProcessorNodeRef);
  });

  test('sends start_over after utterance-end when websocket is open', () => {
    const onUtteranceEnd = jest.fn();
    renderHook(() => useVoiceMode(true, undefined, onUtteranceEnd, 'ws://localhost:5026'));

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.readyState = MockWebSocket.OPEN;
      socket.emitJson({ type: 'utterance_end' });
    });

    expect(onUtteranceEnd).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith('{"type":"start_over"}');
  });

  test('ignores unexpected binary messages', () => {
    const onTranscriptionUpdate = jest.fn();
    renderHook(() => useVoiceMode(true, onTranscriptionUpdate, undefined, 'ws://localhost:5026'));

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.emitRaw(new ArrayBuffer(8));
    });

    expect(onTranscriptionUpdate).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith('[VoiceMode] Received unexpected binary message');
  });

  test('reconnects after socket close while enabled', () => {
    jest.useFakeTimers();
    renderHook(() => useVoiceMode(true, undefined, undefined, 'ws://localhost:5026'));

    expect(MockWebSocket.instances).toHaveLength(1);
    const firstSocket = MockWebSocket.instances[0];

    act(() => {
      firstSocket.onclose?.({} as CloseEvent);
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
    jest.useRealTimers();
  });

  test('cancels pending reconnect when disabled', () => {
    jest.useFakeTimers();
    const { rerender } = renderHook(
      ({ enabled }) => useVoiceMode(enabled, undefined, undefined, 'ws://localhost:5026'),
      { initialProps: { enabled: true } },
    );

    const firstSocket = MockWebSocket.instances[0];
    act(() => {
      firstSocket.onclose?.({} as CloseEvent);
    });

    rerender({ enabled: false });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    jest.useRealTimers();
  });

  test('sets error after exceeding reconnect attempts', () => {
    jest.useFakeTimers();
    const { result } = renderHook(
      () => useVoiceMode(true, undefined, undefined, 'ws://localhost:5026'),
    );

    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      act(() => {
        const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        socket.readyState = MockWebSocket.CLOSED;
        socket.onclose?.({} as CloseEvent);
      });
      act(() => {
        jest.advanceTimersByTime(delay);
      });
    }

    act(() => {
      const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      socket.readyState = MockWebSocket.CLOSED;
      socket.onclose?.({} as CloseEvent);
    });

    expect(result.current.error).toBe('Failed to connect to voice gateway after multiple attempts');
    jest.useRealTimers();
  });

  test('stops pending media stream when disabled before permission resolves', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const stopTrack = jest.fn();
    const mediaStream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    let resolveGetUserMedia: ((stream: MediaStream) => void) | undefined;
    const getUserMedia = jest.fn(() => new Promise<MediaStream>((resolve) => {
      resolveGetUserMedia = resolve;
    }));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    try {
      const { result, rerender } = renderHook(
        ({ enabled }) => useVoiceMode(enabled, undefined, undefined, 'ws://localhost:5026'),
        { initialProps: { enabled: true } },
      );

      const socket = MockWebSocket.instances[0];
      await act(async () => {
        socket.readyState = MockWebSocket.OPEN;
        socket.onopen?.({} as Event);
      });

      await waitFor(() => {
        expect(getUserMedia).toHaveBeenCalledTimes(1);
      });

      rerender({ enabled: false });

      await act(async () => {
        resolveGetUserMedia?.(mediaStream);
      });

      expect(stopTrack).toHaveBeenCalledTimes(1);
      expect(result.current.isRecording).toBe(false);
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: originalMediaDevices,
      });
    }
  });
});
