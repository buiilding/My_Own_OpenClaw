/**
 * Covers desktop audio runtime event parsing behavior in the frontend test suite.
 */

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: jest.fn(),
  },
  ON_CHANNELS: {
    AUDIO_CHUNK: 'audio-chunk',
  },
}));

import * as DesktopAudioRuntimeModule from '../../src/renderer/app/runtime/desktopAudioRuntimeClient';
import { DesktopAudioRuntimeClient } from '../../src/renderer/app/runtime/desktopAudioRuntimeClient';
import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';
import { ON_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';

const unsubscribe = jest.fn();

function subscribeToAudioChunks() {
  const listener = jest.fn();
  const cleanup = DesktopAudioRuntimeClient.onAudioChunk(listener);
  const handler = IpcBridge.on.mock.calls[0]?.[1];
  expect(IpcBridge.on).toHaveBeenCalledWith(ON_CHANNELS.AUDIO_CHUNK, expect.any(Function));
  return { listener, handler, cleanup };
}

describe('desktopAudioRuntimeClient audio chunk parsing', () => {
  beforeEach(() => {
    unsubscribe.mockClear();
    IpcBridge.on.mockReset();
    IpcBridge.on.mockReturnValue(unsubscribe);
  });

  test('keeps the raw audio chunk parser private to the runtime client', () => {
    expect(DesktopAudioRuntimeModule).not.toHaveProperty('extractDesktopAudioChunkPayload');
  });

  test('emits normalized audio chunk payloads for valid audio-chunk events', () => {
    const { listener, handler, cleanup } = subscribeToAudioChunks();

    handler({
      type: 'audio-chunk',
      payload: { audio: 'base64-data', sample_rate: 16000 },
    });

    expect(listener).toHaveBeenCalledWith({ audio: 'base64-data', sample_rate: 16000 });
    expect(cleanup).toBe(unsubscribe);
  });

  test('ignores invalid event envelopes', () => {
    const { listener, handler } = subscribeToAudioChunks();

    handler(null);
    handler({});
    handler({ type: 'tool-call', payload: {} });

    expect(listener).not.toHaveBeenCalled();
  });

  test('ignores malformed audio chunk payloads', () => {
    const { listener, handler } = subscribeToAudioChunks();

    handler({ type: 'audio-chunk', payload: null });
    handler({ type: 'audio-chunk', payload: { sample_rate: 16000 } });
    handler({ type: 'audio-chunk', payload: { audio: 'abc', sample_rate: '16000' } });

    expect(listener).not.toHaveBeenCalled();
  });
});
