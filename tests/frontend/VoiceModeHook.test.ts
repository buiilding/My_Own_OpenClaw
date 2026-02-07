import { act, renderHook } from '@testing-library/react';

import { useVoiceMode } from '../../frontend/src/renderer/features/voice/hooks/useVoiceMode';

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
}

describe('useVoiceMode', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (global as any).WebSocket = MockWebSocket;
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
});
