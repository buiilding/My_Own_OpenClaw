/**
 * Covers voice audio encoding. behavior in the frontend test suite.
 */

import { DesktopVoiceAudioEncodingRuntime } from '../../src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime';

const {
  buildGatewayAudioMessage,
  float32ToPcm16,
  normalizeAudioCaptureChunkSize,
} = DesktopVoiceAudioEncodingRuntime;

describe('voice audio encoding utilities', () => {
  test('float32ToPcm16 clamps and converts samples', () => {
    const samples = new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]);
    const pcm = float32ToPcm16(samples);

    expect(Array.from(pcm)).toEqual([
      -32768,
      -32768,
      -16384,
      0,
      16383,
      32767,
      32767,
    ]);
  });

  test('normalizeAudioCaptureChunkSize selects closest valid size', () => {
    expect(normalizeAudioCaptureChunkSize(1000)).toBe(1024);
    expect(normalizeAudioCaptureChunkSize(17000)).toBe(16384);
    expect(normalizeAudioCaptureChunkSize(1290)).toBe(1280);
  });

  test('buildGatewayAudioMessage frames metadata prefix then audio payload', () => {
    const audio = new Int16Array([1, -2, 3, -4]);
    const message = buildGatewayAudioMessage(audio, 16000);

    const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
    const metadataLength = view.getUint32(0, true);
    const metadataBytes = message.slice(4, 4 + metadataLength);
    const metadata = JSON.parse(String.fromCharCode(...metadataBytes));

    expect(metadata).toEqual({ sampleRate: 16000 });

    const audioBytes = message.slice(4 + metadataLength);
    const framedAudio = new Int16Array(
      audioBytes.buffer,
      audioBytes.byteOffset,
      audioBytes.byteLength / 2,
    );
    expect(Array.from(framedAudio)).toEqual([1, -2, 3, -4]);
  });

  test('buildGatewayAudioMessage respects Int16Array views with offsets', () => {
    const full = new Int16Array([99, 100, 101, 102, 103]);
    const slice = new Int16Array(full.buffer, 2, 2); // [100, 101]
    const message = buildGatewayAudioMessage(slice, 22050);

    const metadataLength = new DataView(message.buffer, message.byteOffset, message.byteLength).getUint32(0, true);
    const audioBytes = message.slice(4 + metadataLength);
    const framedAudio = new Int16Array(
      audioBytes.buffer,
      audioBytes.byteOffset,
      audioBytes.byteLength / 2,
    );

    expect(Array.from(framedAudio)).toEqual([100, 101]);
  });
});
