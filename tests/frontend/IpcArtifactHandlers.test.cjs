/**
 * Covers ipc artifact handlers. behavior in the frontend test suite.
 */

const {
  registerArtifactHandlers,
} = require('../../frontend/src/main/ipc/ipc_artifact_handlers.cjs');

function createHarness(overrides = {}) {
  const handlers = {};
  const deps = {
    uploadArtifact: jest.fn(async (payload) => ({ success: true, uploaded: payload })),
    fetchArtifactImage: jest.fn(async (payload) => ({ success: true, fetched: payload })),
    ensureInstallAuthState: jest.fn(async () => undefined),
    getBackendHttpUrl: jest.fn(() => 'https://api.windieos.com'),
    buildInstallAuthHeaders: jest.fn(() => ({ Authorization: 'Bearer install-token' })),
    ...overrides,
  };
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
  };

  registerArtifactHandlers({
    ipcMain,
    ...deps,
  });

  return {
    deps,
    handlers,
  };
}

describe('ipc_artifact_handlers', () => {
  test('registers upload and fetch handlers', () => {
    const { handlers } = createHarness();

    expect(typeof handlers['upload-artifact']).toBe('function');
    expect(typeof handlers['fetch-artifact-image']).toBe('function');
  });

  test('uploads artifacts with backend URL and install auth headers', async () => {
    const { deps, handlers } = createHarness();

    const result = await handlers['upload-artifact'](null, {
      base64: 'abc',
      contentType: 'image/png',
    });

    expect(deps.uploadArtifact).toHaveBeenCalledWith({
      base64: 'abc',
      contentType: 'image/png',
      backendHttpUrl: 'https://api.windieos.com',
      headers: { Authorization: 'Bearer install-token' },
    });
    expect(result.success).toBe(true);
  });

  test('ensures install auth before fetching protected artifact images', async () => {
    const { deps, handlers } = createHarness();

    const result = await handlers['fetch-artifact-image'](null, {
      artifactId: 'artifact-1',
    });

    expect(deps.ensureInstallAuthState).toHaveBeenCalledTimes(1);
    expect(deps.fetchArtifactImage).toHaveBeenCalledWith({
      artifactId: 'artifact-1',
      backendHttpUrl: 'https://api.windieos.com',
      headers: { Authorization: 'Bearer install-token' },
    });
    expect(result.success).toBe(true);
  });

  test('returns structured fetch errors', async () => {
    const { handlers } = createHarness({
      ensureInstallAuthState: jest.fn(async () => {
        throw new Error('install auth unavailable');
      }),
    });

    await expect(handlers['fetch-artifact-image'](null, {
      artifactId: 'artifact-1',
    })).resolves.toEqual({
      success: false,
      error: 'install auth unavailable',
    });
  });
});
