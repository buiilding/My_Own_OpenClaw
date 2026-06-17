/**
 * Covers audio chunk event parsing behavior in the frontend test suite.
 */

import { extractAudioChunkPayload } from '../../frontend/src/renderer/features/chat/utils/audioChunkEvents';

describe('audioChunkEvents', () => {
  test('returns normalized audio chunk payload for valid audio-chunk events', () => {
    expect(
      extractAudioChunkPayload({
        type: 'audio-chunk',
        payload: { audio: 'base64-data', sample_rate: 16000 },
      }),
    ).toEqual({ audio: 'base64-data', sample_rate: 16000 });
  });

  test('returns null for invalid event envelopes', () => {
    expect(extractAudioChunkPayload(null)).toBeNull();
    expect(extractAudioChunkPayload({})).toBeNull();
    expect(extractAudioChunkPayload({ type: 'tool-call', payload: {} })).toBeNull();
  });

  test('returns null for malformed audio chunk payloads', () => {
    expect(extractAudioChunkPayload({ type: 'audio-chunk', payload: null })).toBeNull();
    expect(extractAudioChunkPayload({ type: 'audio-chunk', payload: { sample_rate: 16000 } })).toBeNull();
    expect(extractAudioChunkPayload({ type: 'audio-chunk', payload: { audio: 'abc', sample_rate: '16000' } })).toBeNull();
  });
});
