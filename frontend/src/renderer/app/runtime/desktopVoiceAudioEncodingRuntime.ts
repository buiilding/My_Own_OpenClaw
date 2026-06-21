/**
 * Provides voice audio encoding helpers for the renderer app-runtime.
 */

const VALID_AUDIO_CAPTURE_CHUNK_SIZES = [256, 512, 1024, 1280, 2048, 4096, 8192, 16384];
const metadataPrefixCache = new Map<number, Uint8Array>();

function encodeAscii(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    bytes[i] = value.charCodeAt(i);
  }
  return bytes;
}

export function float32ToPcm16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return int16Array;
}

export function normalizeAudioCaptureChunkSize(size: number): number {
  return VALID_AUDIO_CAPTURE_CHUNK_SIZES.reduce((previous, current) =>
    Math.abs(current - size) < Math.abs(previous - size) ? current : previous,
  );
}

function getGatewayMetadataPrefix(sampleRate: number): Uint8Array {
  const cachedPrefix = metadataPrefixCache.get(sampleRate);
  if (cachedPrefix) {
    return cachedPrefix;
  }

  const metadataBytes = encodeAscii(JSON.stringify({ sampleRate }));
  const prefix = new Uint8Array(4 + metadataBytes.length);
  new DataView(prefix.buffer).setUint32(0, metadataBytes.length, true);
  prefix.set(metadataBytes, 4);
  metadataPrefixCache.set(sampleRate, prefix);
  return prefix;
}

export function buildGatewayAudioMessage(audioData: Int16Array, sampleRate: number = 16000): Uint8Array {
  const metadataPrefix = getGatewayMetadataPrefix(sampleRate);
  const audioBytes = new Uint8Array(audioData.buffer, audioData.byteOffset, audioData.byteLength);
  const message = new Uint8Array(metadataPrefix.length + audioBytes.length);
  message.set(metadataPrefix, 0);
  message.set(audioBytes, metadataPrefix.length);
  return message;
}
