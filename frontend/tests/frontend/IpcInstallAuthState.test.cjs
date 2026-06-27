/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(),
  },
}));

const { app } = require('electron');

const {
  getInstallAuthStatePath,
  loadInstallAuthStateFromDisk,
  saveInstallAuthStateToDisk,
  validateInstallAuthStateWithBackend,
} = require('../../src/main/ipc/ipc_install_auth_state.cjs');

const shouldCheckPosixFileModes = process.platform !== 'win32';

function modeOf(targetPath) {
  return fs.statSync(targetPath).mode & 0o777;
}

describe('ipc_install_auth_state persistence', () => {
  let userDataPath;

  beforeEach(async () => {
    userDataPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'desktop-runtime-install-auth-'));
    app.getPath.mockReturnValue(userDataPath);
  });

  afterEach(async () => {
    await fs.promises.rm(userDataPath, { recursive: true, force: true });
    app.getPath.mockReset();
  });

  test('uses generic fallback directory when Electron userData is unavailable', () => {
    const originalGetPath = app.getPath;
    app.getPath = null;
    try {
      expect(getInstallAuthStatePath()).toBe(path.join(os.tmpdir(), 'desktop-runtime', 'install-auth.json'));
    } finally {
      app.getPath = originalGetPath;
    }
  });

  test('saves install auth state with restrictive POSIX file permissions', async () => {
    const result = await saveInstallAuthStateToDisk(
      {
        installToken: 'wnd_install_secret',
        userId: 'user_123',
        installId: 'install_123',
      },
      jest.fn(),
    );

    expect(result.success).toBe(true);
    const filePath = getInstallAuthStatePath();
    expect(JSON.parse(await fs.promises.readFile(filePath, 'utf-8'))).toEqual({
      installToken: 'wnd_install_secret',
      userId: 'user_123',
      installId: 'install_123',
    });

    if (shouldCheckPosixFileModes) {
      expect(modeOf(filePath)).toBe(0o600);
      expect(modeOf(userDataPath)).toBe(0o700);
    }
  });

  test('hardens existing valid install auth state on load', async () => {
    const filePath = getInstallAuthStatePath();
    await fs.promises.writeFile(
      filePath,
      JSON.stringify({
        installToken: 'wnd_install_secret',
        userId: 'user_123',
        installId: 'install_123',
      }),
      'utf-8',
    );
    if (shouldCheckPosixFileModes) {
      await fs.promises.chmod(filePath, 0o644);
      await fs.promises.chmod(userDataPath, 0o755);
    }

    const state = await loadInstallAuthStateFromDisk(jest.fn());

    expect(state).toEqual({
      installToken: 'wnd_install_secret',
      userId: 'user_123',
      installId: 'install_123',
    });
    if (shouldCheckPosixFileModes) {
      expect(modeOf(filePath)).toBe(0o600);
      expect(modeOf(userDataPath)).toBe(0o700);
    }
  });

  test('validates cached install auth against backend identity endpoint', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        user_id: 'user_backend',
        install_id: 'install_backend',
      }),
    }));

    const result = await validateInstallAuthStateWithBackend(
      {
        installToken: 'wnd_install_secret',
        userId: 'user_cached',
        installId: 'install_cached',
      },
      {
        backendHttpUrl: 'https://auth.backend.example.test/',
        fetchImpl,
      },
    );

    expect(result).toEqual({
      valid: true,
      invalidToken: false,
      status: 200,
      state: {
        installToken: 'wnd_install_secret',
        userId: 'user_backend',
        installId: 'install_backend',
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://auth.backend.example.test/api/install/me',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer wnd_install_secret',
        },
      },
    );
  });

  test('classifies backend 401 as an invalid cached install token', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"detail":"Invalid install bearer token"}',
    }));

    const result = await validateInstallAuthStateWithBackend(
      {
        installToken: 'wnd_install_secret',
        userId: 'user_cached',
        installId: 'install_cached',
      },
      {
        backendHttpUrl: 'https://auth.backend.example.test',
        fetchImpl,
      },
    );

    expect(result).toMatchObject({
      valid: false,
      invalidToken: true,
      status: 401,
    });
  });
});
