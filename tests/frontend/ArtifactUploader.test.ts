jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: jest.fn(),
  },
  INVOKE_CHANNELS: {
    UPLOAD_ARTIFACT: 'upload-artifact',
  },
}));

import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import {
  buildArtifactUrl,
  setBackendHttpUrl,
  uploadArtifactBase64,
} from '../../frontend/src/renderer/infrastructure/services/ArtifactUploader';

const mockInvoke = IpcBridge.invoke as jest.MockedFunction<typeof IpcBridge.invoke>;

describe('ArtifactUploader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setBackendHttpUrl('http://127.0.0.1:8765');
  });

  test('returns null for empty base64 input without invoking IPC', async () => {
    await expect(uploadArtifactBase64('', 'image/png')).resolves.toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test('returns mapped artifact data on successful upload', async () => {
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        artifact_id: 'art-1',
        content_type: 'image/png',
        size_bytes: 123,
        sha256: 'abc',
        url: 'http://127.0.0.1:8765/api/artifacts/art-1',
      },
    } as any);

    await expect(uploadArtifactBase64('base64-data', 'image/png', 'shot.png')).resolves.toEqual({
      artifactId: 'art-1',
      contentType: 'image/png',
      sizeBytes: 123,
      sha256: 'abc',
      url: 'http://127.0.0.1:8765/api/artifacts/art-1',
    });

    expect(mockInvoke).toHaveBeenCalledWith(INVOKE_CHANNELS.UPLOAD_ARTIFACT, {
      base64: 'base64-data',
      contentType: 'image/png',
      filename: 'shot.png',
    });
  });

  test('returns null when upload response is unsuccessful or missing data', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'upload failed' } as any);
    await expect(uploadArtifactBase64('base64-data', 'image/png')).resolves.toBeNull();

    mockInvoke.mockResolvedValueOnce({ success: true } as any);
    await expect(uploadArtifactBase64('base64-data', 'image/png')).resolves.toBeNull();
    warnSpy.mockRestore();
  });

  test('buildArtifactUrl returns canonical API artifact path', () => {
    expect(buildArtifactUrl('art-2')).toBe('http://127.0.0.1:8765/api/artifacts/art-2');
  });

  test('buildArtifactUrl uses runtime backend http URL when provided', () => {
    setBackendHttpUrl('http://10.0.0.42:9001/');
    expect(buildArtifactUrl('art-2')).toBe('http://10.0.0.42:9001/api/artifacts/art-2');
  });
});
