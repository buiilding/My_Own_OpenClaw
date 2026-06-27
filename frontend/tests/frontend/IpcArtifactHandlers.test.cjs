/**
 * Covers ipc artifact handlers. behavior in the frontend test suite.
 */

const fs = require('fs/promises');
const path = require('path');

const {
  createArtifactHandlersRuntime,
} = require('../../src/main/ipc/ipc_artifact_handlers.cjs');

function createHarness(overrides = {}) {
  const handlers = {};
  const deps = {
    uploadArtifact: jest.fn(async (payload) => ({ success: true, uploaded: payload })),
    fetchArtifactImage: jest.fn(async (payload) => ({ success: true, fetched: payload })),
    ensureInstallAuthState: jest.fn(async () => undefined),
    getBackendHttpUrl: jest.fn(() => 'https://backend.example.com'),
    buildInstallAuthHeaders: jest.fn(() => ({ Authorization: 'Bearer install-token' })),
    ...overrides,
  };
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
  };

  const runtime = createArtifactHandlersRuntime({
    ...deps,
  });
  runtime.register({ ipcMain });

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
      backendHttpUrl: 'https://backend.example.com',
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
      backendHttpUrl: 'https://backend.example.com',
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

  test('runtime registers handlers with injected backend and auth dependencies', async () => {
    const handlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
    };
    const runtime = createArtifactHandlersRuntime({
      uploadArtifact: jest.fn(async (payload) => ({ success: true, uploaded: payload })),
      fetchArtifactImage: jest.fn(async (payload) => ({ success: true, fetched: payload })),
      ensureInstallAuthState: jest.fn(async () => undefined),
      getBackendHttpUrl: jest.fn(() => 'https://runtime.backend.example.test'),
      buildInstallAuthHeaders: jest.fn(() => ({ Authorization: 'Bearer runtime-token' })),
    });

    runtime.register({ ipcMain });

    await expect(handlers['upload-artifact'](null, {
      base64: 'runtime-image',
    })).resolves.toEqual({
      success: true,
      uploaded: {
        base64: 'runtime-image',
        backendHttpUrl: 'https://runtime.backend.example.test',
        headers: { Authorization: 'Bearer runtime-token' },
      },
    });
  });

  test('ipc.cjs registers artifact handlers through the runtime wrapper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_artifact_handlers.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createArtifactHandlersRuntime({');
    expect(mainSource).not.toContain('artifactHandlersRuntime.register({ ipcMain })');
    expect(initializationSource).toContain('artifactHandlersRuntime.register({ ipcMain })');
    expect(mainSource).not.toContain('registerArtifactHandlers({');
    expect(helperSource).toContain('function createArtifactHandlersRuntime');
    expect(helperSource).toContain('return registerArtifactHandlers({');
    const artifactHandlersModule = require('../../src/main/ipc/ipc_artifact_handlers.cjs');
    expect(artifactHandlersModule.registerArtifactHandlers).toBeUndefined();
  });
});
