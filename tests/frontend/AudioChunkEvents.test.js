/**
 * Covers desktop audio runtime event parsing behavior in the frontend test suite.
 */

import {
  extractDesktopAudioChunkPayload,
} from '../../frontend/src/renderer/app/runtime/desktopAudioRuntimeClient';

describe('desktopAudioRuntimeClient audio chunk parsing', () => {
  test('returns normalized audio chunk payload for valid audio-chunk events', () => {
    expect(
      extractDesktopAudioChunkPayload({
        type: 'audio-chunk',
        payload: { audio: 'base64-data', sample_rate: 16000 },
      }),
    ).toEqual({ audio: 'base64-data', sample_rate: 16000 });
  });

  test('returns null for invalid event envelopes', () => {
    expect(extractDesktopAudioChunkPayload(null)).toBeNull();
    expect(extractDesktopAudioChunkPayload({})).toBeNull();
    expect(extractDesktopAudioChunkPayload({ type: 'tool-call', payload: {} })).toBeNull();
  });

  test('returns null for malformed audio chunk payloads', () => {
    expect(extractDesktopAudioChunkPayload({ type: 'audio-chunk', payload: null })).toBeNull();
    expect(extractDesktopAudioChunkPayload({ type: 'audio-chunk', payload: { sample_rate: 16000 } })).toBeNull();
    expect(extractDesktopAudioChunkPayload({ type: 'audio-chunk', payload: { audio: 'abc', sample_rate: '16000' } })).toBeNull();
  });
});
