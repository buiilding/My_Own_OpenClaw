/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createInstallAuthIdentityRuntime,
  normalizeInstallAuthState,
} = require('../../frontend/src/main/ipc/ipc_install_auth_identity_runtime.cjs');

function createIdentityRuntime(initialState = {}) {
  const state = {
    currentInstallToken: null,
    currentUserId: null,
    currentInstallId: null,
    currentServerUserId: null,
    ...initialState,
  };
  const runtime = createInstallAuthIdentityRuntime({
    getState: () => state,
    setInstallToken: (value) => {
      state.currentInstallToken = value;
    },
    setInstallId: (value) => {
      state.currentInstallId = value;
    },
    setCurrentUserId: (value) => {
      state.currentUserId = value;
    },
    setCurrentServerUserId: (value) => {
      state.currentServerUserId = value;
    },
  });
  return { runtime, state };
}

describe('ipc_install_auth_identity_runtime', () => {
  test('normalizes complete install auth state and rejects incomplete values', () => {
    expect(normalizeInstallAuthState({
      installToken: ' token-1 ',
      userId: ' user-1 ',
      installId: ' install-1 ',
    })).toEqual({
      installToken: 'token-1',
      userId: 'user-1',
      installId: 'install-1',
    });
    expect(normalizeInstallAuthState({
      installToken: 'token-1',
      userId: '',
      installId: 'install-1',
    })).toBeNull();
    expect(normalizeInstallAuthState(null)).toBeNull();
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

    expect(state).toEqual({
      currentInstallToken: 'token-1',
      currentUserId: 'user-1',
      currentInstallId: 'install-1',
      currentServerUserId: 'user-1',
    });
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

  test('ipc.cjs delegates install identity normalization and SDK auth shaping to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_install_auth_identity_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createInstallAuthIdentityRuntime({');
    expect(mainSource).not.toContain('const installToken = typeof state.installToken');
    expect(mainSource).not.toContain('autoRegister: false');
    expect(helperSource).toContain('const installToken = typeof state.installToken');
    expect(helperSource).toContain('autoRegister: false');
  });
});
