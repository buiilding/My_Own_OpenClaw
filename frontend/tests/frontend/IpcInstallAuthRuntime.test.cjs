/** @jest-environment node */

const {
  createInstallAuthRuntime,
} = require('../../src/main/ipc/ipc_install_auth_runtime.cjs');
const {
  resolveDesktopHostOperatingSystem,
} = require('../../src/main/ipc/ipc_desktop_host_os_runtime.cjs');
const fs = require('fs');
const path = require('path');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createDeps(overrides = {}) {
  let currentState = overrides.currentState || null;
  const deps = {
    getCurrentState: jest.fn(() => currentState),
    applyInstallAuthState: jest.fn((state) => {
      if (!state) {
        return null;
      }
      currentState = {
        installToken: state.installToken,
        userId: state.userId,
        installId: state.installId,
      };
      return currentState;
    }),
    getEndpointCandidates: jest.fn(() => [
      { httpUrl: 'https://primary.example.test' },
      { httpUrl: 'https://fallback.example.test' },
    ]),
    setActiveBackendEndpoint: jest.fn(),
    loadInstallAuthStateFromDisk: jest.fn(async () => null),
    validateInstallAuthStateWithBackend: jest.fn(async () => ({
      valid: false,
      invalidToken: false,
      error: 'unavailable',
    })),
    registerInstallWithBackend: jest.fn(async () => ({
      installToken: 'registered-token',
      userId: 'registered-user',
      installId: 'registered-install',
    })),
    saveInstallAuthStateToDisk: jest.fn(async () => ({ success: true })),
    clearInstallAuthStateFromDisk: jest.fn(async () => ({ success: true })),
    getPlatform: jest.fn(() => 'win32'),
    log: jest.fn(),
    ...overrides,
  };
  deps.setCurrentState = (state) => {
    currentState = state;
  };
  return deps;
}

describe('ipc_install_auth_runtime', () => {
  test('maps host platform names for install registration metadata', () => {
    expect(resolveDesktopHostOperatingSystem('darwin')).toBe('macOS');
    expect(resolveDesktopHostOperatingSystem('win32')).toBe('Windows');
    expect(resolveDesktopHostOperatingSystem('linux')).toBe('Linux');
    expect(resolveDesktopHostOperatingSystem('freebsd')).toBe('freebsd');
    expect(resolveDesktopHostOperatingSystem('')).toBeNull();
  });

  test('imports the host OS resolver from its owner module', () => {
    const installAuthSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main/ipc/ipc_install_auth_runtime.cjs'),
      'utf8',
    );
    const hostOsSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main/ipc/ipc_desktop_host_os_runtime.cjs'),
      'utf8',
    );

    expect(hostOsSource).toContain('resolveDesktopHostOperatingSystem');
    expect(installAuthSource).toContain("require('./ipc_desktop_host_os_runtime.cjs')");
    expect(installAuthSource).not.toContain('module.exports = {\n  createInstallAuthRuntime,\n  resolveDesktopHostOperatingSystem');
  });

  test('builds bearer headers from the current install token without requiring identity fields', () => {
    const deps = createDeps({
      currentState: {
        installToken: ' token-1 ',
        userId: null,
        installId: null,
      },
    });
    const runtime = createInstallAuthRuntime(deps);

    expect(runtime.buildInstallAuthHeaders()).toEqual({
      Authorization: 'Bearer token-1',
    });

    deps.setCurrentState(null);
    expect(runtime.buildInstallAuthHeaders()).toEqual({});
  });

  test('returns already-applied install auth without disk or backend work', async () => {
    const deps = createDeps({
      currentState: {
        installToken: 'token-1',
        userId: 'user-1',
        installId: 'install-1',
      },
    });
    const runtime = createInstallAuthRuntime(deps);

    await expect(runtime.ensureInstallAuthState()).resolves.toEqual({
      installToken: 'token-1',
      userId: 'user-1',
      installId: 'install-1',
    });

    expect(deps.loadInstallAuthStateFromDisk).not.toHaveBeenCalled();
    expect(deps.registerInstallWithBackend).not.toHaveBeenCalled();
  });

  test('validates cached disk state across backend candidates and persists identity refreshes', async () => {
    const cachedState = {
      installToken: 'cached-token',
      userId: 'cached-user',
      installId: 'cached-install',
    };
    const validatedState = {
      installToken: 'cached-token',
      userId: 'backend-user',
      installId: 'backend-install',
    };
    const deps = createDeps({
      loadInstallAuthStateFromDisk: jest.fn(async () => cachedState),
      validateInstallAuthStateWithBackend: jest.fn()
        .mockResolvedValueOnce({
          valid: false,
          invalidToken: false,
          error: 'primary down',
        })
        .mockResolvedValueOnce({
          valid: true,
          invalidToken: false,
          state: validatedState,
        }),
    });
    const runtime = createInstallAuthRuntime(deps);

    await expect(runtime.ensureInstallAuthState()).resolves.toEqual(validatedState);

    expect(deps.validateInstallAuthStateWithBackend).toHaveBeenNthCalledWith(
      1,
      cachedState,
      { backendHttpUrl: 'https://primary.example.test' },
    );
    expect(deps.validateInstallAuthStateWithBackend).toHaveBeenNthCalledWith(
      2,
      cachedState,
      { backendHttpUrl: 'https://fallback.example.test' },
    );
    expect(deps.setActiveBackendEndpoint).toHaveBeenCalledWith(1);
    expect(deps.saveInstallAuthStateToDisk).toHaveBeenCalledWith(validatedState, deps.log);
    expect(deps.registerInstallWithBackend).not.toHaveBeenCalled();
  });

  test('clears rejected cached tokens and registers a fresh install with host OS metadata', async () => {
    const cachedState = {
      installToken: 'stale-token',
      userId: 'stale-user',
      installId: 'stale-install',
    };
    const registeredState = {
      installToken: 'registered-token',
      userId: 'registered-user',
      installId: 'registered-install',
    };
    const deps = createDeps({
      loadInstallAuthStateFromDisk: jest.fn(async () => cachedState),
      validateInstallAuthStateWithBackend: jest.fn(async () => ({
        valid: false,
        invalidToken: true,
        status: 401,
        error: 'invalid',
      })),
      registerInstallWithBackend: jest.fn(async () => registeredState),
    });
    const runtime = createInstallAuthRuntime(deps);

    await expect(runtime.ensureInstallAuthState()).resolves.toEqual(registeredState);

    expect(deps.clearInstallAuthStateFromDisk).toHaveBeenCalledWith(deps.log);
    expect(deps.registerInstallWithBackend).toHaveBeenCalledWith({
      backendHttpUrl: 'https://primary.example.test',
      operatingSystem: 'Windows',
      log: deps.log,
    });
    expect(deps.saveInstallAuthStateToDisk).toHaveBeenCalledWith(registeredState, deps.log);
    expect(deps.setActiveBackendEndpoint).toHaveBeenCalledWith(0);
  });

  test('shares a pending install-auth ensure operation', async () => {
    const diskLoad = deferred();
    const deps = createDeps({
      loadInstallAuthStateFromDisk: jest.fn(() => diskLoad.promise),
    });
    const runtime = createInstallAuthRuntime(deps);

    const first = runtime.ensureInstallAuthState();
    const second = runtime.ensureInstallAuthState();
    diskLoad.resolve(null);

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        installToken: 'registered-token',
        userId: 'registered-user',
        installId: 'registered-install',
      },
      {
        installToken: 'registered-token',
        userId: 'registered-user',
        installId: 'registered-install',
      },
    ]);
    expect(deps.loadInstallAuthStateFromDisk).toHaveBeenCalledTimes(1);
    expect(deps.registerInstallWithBackend).toHaveBeenCalledTimes(1);
  });
});
