/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createInstallAuthContextRuntime,
} = require('../../src/main/ipc/ipc_install_auth_context_runtime.cjs');

function createDeps(overrides = {}) {
  const state = {
    currentServerUserId: null,
  };
  return {
    getCurrentServerUserId: jest.fn(() => state.currentServerUserId),
    setCurrentServerUserId: jest.fn((value) => {
      state.currentServerUserId = value;
    }),
    getEndpointCandidates: jest.fn(() => [{ httpUrl: 'https://api.example.test' }]),
    setActiveBackendEndpoint: jest.fn(),
    loadInstallAuthStateFromDisk: jest.fn(async () => null),
    validateInstallAuthStateWithBackend: jest.fn(),
    registerInstallWithBackend: jest.fn(async () => ({
      installToken: 'registered-token',
      userId: 'registered-user',
      installId: 'registered-install',
    })),
    saveInstallAuthStateToDisk: jest.fn(async () => ({ success: true })),
    clearInstallAuthStateFromDisk: jest.fn(async () => ({ success: true })),
    getPlatform: jest.fn(() => 'win32'),
    log: jest.fn(),
    state,
    ...overrides,
  };
}

describe('ipc_install_auth_context_runtime', () => {
  test('composes identity state, install registration, headers, and SDK auth options', async () => {
    const deps = createDeps();
    const runtime = createInstallAuthContextRuntime(deps);

    await expect(runtime.ensureInstallAuthState()).resolves.toEqual({
      installToken: 'registered-token',
      userId: 'registered-user',
      installId: 'registered-install',
    });

    expect(deps.registerInstallWithBackend).toHaveBeenCalledWith({
      backendHttpUrl: 'https://api.example.test',
      operatingSystem: 'Windows',
      log: deps.log,
    });
    expect(deps.setCurrentServerUserId).toHaveBeenCalledWith('registered-user');
    expect(runtime.getCurrentUserId()).toBe('registered-user');
    expect(runtime.buildInstallAuthHeaders()).toEqual({
      Authorization: 'Bearer registered-token',
    });
    expect(runtime.buildDesktopInstallAuth()).toEqual({
      userId: 'registered-user',
      installId: 'registered-install',
      installToken: 'registered-token',
      autoRegister: false,
    });
  });

  test('reset clears composed identity state and pending auth runtime state', async () => {
    const deps = createDeps();
    const runtime = createInstallAuthContextRuntime(deps);
    await runtime.ensureInstallAuthState();

    runtime.reset();

    expect(runtime.getCurrentState()).toEqual({
      installToken: null,
      userId: null,
      installId: null,
    });
    expect(runtime.buildDesktopInstallAuth()).toBeUndefined();
    expect(runtime.buildInstallAuthHeaders()).toEqual({});
  });

  test('ipc.cjs delegates install-auth coordination to the context runtime', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const contextSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_install_auth_context_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createInstallAuthContextRuntime({');
    expect(mainSource).toContain('installAuthContextRuntime.ensureInstallAuthState()');
    expect(mainSource).toContain('installAuthContextRuntime.buildDesktopInstallAuth()');
    expect(mainSource).toContain('installAuthContextRuntime.buildInstallAuthHeaders()');
    expect(mainSource).not.toContain('createInstallAuthIdentityRuntime({');
    expect(mainSource).not.toContain('createInstallAuthRuntime({');
    expect(mainSource).not.toContain('installAuthIdentityRuntime');
    expect(mainSource).not.toContain('installAuthRuntime');
    expect(contextSource).toContain('createInstallAuthIdentityRuntime({');
    expect(contextSource).toContain('createInstallAuthRuntime({');
  });
});
