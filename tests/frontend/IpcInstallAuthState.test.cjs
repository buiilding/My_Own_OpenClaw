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
  shouldApplyPosixFileModes,
} = require('../../frontend/src/main/ipc/ipc_install_auth_state.cjs');

function modeOf(targetPath) {
  return fs.statSync(targetPath).mode & 0o777;
}

describe('ipc_install_auth_state persistence', () => {
  let userDataPath;

  beforeEach(async () => {
    userDataPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'windieos-install-auth-'));
    app.getPath.mockReturnValue(userDataPath);
  });

  afterEach(async () => {
    await fs.promises.rm(userDataPath, { recursive: true, force: true });
    app.getPath.mockReset();
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

    if (shouldApplyPosixFileModes()) {
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
    if (shouldApplyPosixFileModes()) {
      await fs.promises.chmod(filePath, 0o644);
      await fs.promises.chmod(userDataPath, 0o755);
    }

    const state = await loadInstallAuthStateFromDisk(jest.fn());

    expect(state).toEqual({
      installToken: 'wnd_install_secret',
      userId: 'user_123',
      installId: 'install_123',
    });
    if (shouldApplyPosixFileModes()) {
      expect(modeOf(filePath)).toBe(0o600);
      expect(modeOf(userDataPath)).toBe(0o700);
    }
  });
});
