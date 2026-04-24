/** @jest-environment node */

const {
  buildArtifactFetchUrl,
  fetchArtifactImage,
  inferArtifactId,
} = require('../../frontend/src/main/ipc/ipc_artifact_fetch.cjs');

describe('ipc artifact fetch helper', () => {
  test('infers artifact id from canonical artifact url', () => {
    expect(inferArtifactId('https://api.windieos.com/api/artifacts/artifact-123?x=1')).toBe('artifact-123');
  });

  test('builds artifact fetch url from backend base and artifact id', () => {
    expect(buildArtifactFetchUrl({
      backendHttpUrl: 'https://api.windieos.com/',
      artifactId: 'artifact-123',
    })).toBe('https://api.windieos.com/api/artifacts/artifact-123');
  });

  test('fetches protected artifact bytes and returns a data url', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: jest.fn((name) => (name === 'content-type' ? 'image/png' : null)),
      },
      arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer,
    });

    const result = await fetchArtifactImage({
      artifactId: 'artifact-123',
      backendHttpUrl: 'https://api.windieos.com',
      headers: {
        Authorization: 'Bearer test-install-token',
      },
      fetchImpl,
    });

    expect(result).toEqual({
      success: true,
      dataUrl: 'data:image/png;base64,iVBORw==',
      contentType: 'image/png',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.windieos.com/api/artifacts/artifact-123',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-install-token',
        },
      },
    );
  });
});
