/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const installAuthIdentityModule = require('../../src/main/ipc/ipc_install_auth_identity_runtime.cjs');
const {
  createInstallAuthIdentityRuntime,
} = installAuthIdentityModule;

function createIdentityRuntime(initialState = {}) {
  const state = {
    currentServerUserId: null,
  };
  const {
    currentServerUserId = null,
    ...identityInitialState
  } = initialState;
  state.currentServerUserId = currentServerUserId;
  const runtime = createInstallAuthIdentityRuntime({
    initialState: identityInitialState,
    getCurrentServerUserId: () => state.currentServerUserId,
    setCurrentServerUserId: (value) => {
      state.currentServerUserId = value;
    },
  });
  return { runtime, state };
}

describe('ipc_install_auth_identity_runtime', () => {
  test('normalizes complete install auth state and rejects incomplete values through the runtime facade', () => {
    const { runtime } = createIdentityRuntime();

    expect(runtime.applyInstallAuthState({
      installToken: ' token-1 ',
      userId: ' user-1 ',
      installId: ' install-1 ',
    })).toEqual({
      installToken: 'token-1',
      userId: 'user-1',
      installId: 'install-1',
    });
    expect(runtime.applyInstallAuthState({
      installToken: 'token-1',
      userId: '',
      installId: 'install-1',
    })).toBeNull();
    expect(runtime.applyInstallAuthState(null)).toBeNull();
  });

  test('applies normalized identity and initializes server user when missing', () => {
    const { runtime, state } = createIdentityRuntime();

    expect(runtime.applyInstallAuthState({
      installToken: ' token-1 ',
      userId: ' user-1 ',
      installId: ' install-1 ',
    })).toEqual({
      installToken: 'token-1',
      userId: 'user-1',
      installId: 'install-1',
    });

    expect(runtime.getCurrentState()).toEqual({
      installToken: 'token-1',
      userId: 'user-1',
      installId: 'install-1',
    });
    expect(state.currentServerUserId).toBe('user-1');
  });

  test('does not overwrite an existing server-issued user id', () => {
    const { runtime, state } = createIdentityRuntime({
      currentServerUserId: 'server-user-1',
    });

    runtime.applyInstallAuthState({
      installToken: 'token-1',
      userId: 'user-1',
      installId: 'install-1',
    });

    expect(state.currentServerUserId).toBe('server-user-1');
  });

  test('builds the desktop SDK installAuth option from current identity state', () => {
    const { runtime } = createIdentityRuntime({
      currentInstallToken: 'token-1',
      currentUserId: 'user-1',
      currentInstallId: 'install-1',
    });

    expect(runtime.getCurrentState()).toEqual({
      installToken: 'token-1',
      userId: 'user-1',
      installId: 'install-1',
    });
    expect(runtime.buildDesktopInstallAuth()).toEqual({
      userId: 'user-1',
      installId: 'install-1',
      installToken: 'token-1',
      autoRegister: false,
    });
  });

  test('returns undefined installAuth when no token is available', () => {
    const { runtime } = createIdentityRuntime();

    expect(runtime.buildDesktopInstallAuth()).toBeUndefined();
  });

  test('updates current user independently and resets owned identity state', () => {
    const { runtime } = createIdentityRuntime({
      currentInstallToken: 'token-1',
      currentUserId: 'user-1',
      currentInstallId: 'install-1',
    });

    runtime.setCurrentUserId('user-2');
    expect(runtime.getCurrentUserId()).toBe('user-2');
    expect(runtime.getCurrentState()).toEqual({
      installToken: 'token-1',
      userId: 'user-2',
      installId: 'install-1',
    });

    runtime.reset();
    expect(runtime.getCurrentUserId()).toBeNull();
    expect(runtime.getCurrentState()).toEqual({
      installToken: null,
      userId: null,
      installId: null,
    });
    expect(runtime.buildDesktopInstallAuth()).toBeUndefined();
  });

  test('ipc.cjs delegates install identity normalization and SDK auth shaping to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const contextSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_install_auth_context_runtime.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_install_auth_identity_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createInstallAuthContextRuntime({');
    expect(mainSource).toContain('ipcSessionContextRuntime.getCurrentUserId()');
    expect(mainSource).toContain('ipcSessionContextRuntime.setTranscriptSessionState(state)');
    expect(mainSource).not.toContain('createInstallAuthIdentityRuntime({');
    expect(mainSource).not.toContain('installAuthIdentityRuntime');
    expect(mainSource).not.toContain('installAuthContextRuntime.getCurrentUserId()');
    expect(contextSource).toContain('createInstallAuthIdentityRuntime({');
    expect(contextSource).toContain('identityRuntime.getCurrentUserId()');
    expect(contextSource).toContain('identityRuntime.setCurrentUserId(userId)');
    expect(mainSource).not.toContain('let currentUserId = null');
    expect(mainSource).not.toContain('let currentInstallId = null');
    expect(mainSource).not.toContain('let currentInstallToken = null');
    expect(mainSource).not.toContain('const installToken = typeof state.installToken');
    expect(mainSource).not.toContain('autoRegister: false');
    expect(helperSource).toContain('const installToken = typeof state.installToken');
    expect(helperSource).toContain('let currentInstallToken = initialState.currentInstallToken');
    expect(helperSource).toContain('let currentUserId = initialState.currentUserId');
    expect(helperSource).toContain('let currentInstallId = initialState.currentInstallId');
    expect(helperSource).toContain('autoRegister: false');
    expect(installAuthIdentityModule.normalizeInstallAuthState).toBeUndefined();
  });
});
