/** @jest-environment node */

const {
  fetchArtifactImage,
} = require('../../src/main/ipc/ipc_artifact_fetch.cjs');

describe('ipc artifact fetch helper', () => {
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
      backendHttpUrl: 'https://backend.example.com',
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
      'https://backend.example.com/api/artifacts/artifact-123',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-install-token',
        },
      },
    );
  });

  test('infers canonical artifact urls through the fetch path', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: jest.fn(() => 'image/jpeg'),
      },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });

    await fetchArtifactImage({
      url: 'https://other.example.com/api/artifacts/artifact-456?x=1',
      backendHttpUrl: 'https://backend.example.com/',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://backend.example.com/api/artifacts/artifact-456',
      {
        method: 'GET',
        headers: {},
      },
    );
  });
});
