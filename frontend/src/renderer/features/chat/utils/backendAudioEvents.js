/**
 * Provides the backend audio events module for the renderer UI.
 */

export function extractAudioChunkPayload(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const event = data;
  if (event.type !== 'audio-chunk' || !event.payload || typeof event.payload !== 'object') {
    return null;
  }

  const { audio, sample_rate: sampleRate } = event.payload;
  if (typeof audio !== 'string' || typeof sampleRate !== 'number') {
    return null;
  }

  return { audio, sample_rate: sampleRate };
}
