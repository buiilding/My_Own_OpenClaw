/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('IPC persistence concurrency', () => {
  let userDataPath;
  let app;
  let loadDesktopUiConfigFromDisk;
  let saveDesktopUiConfigToDisk;
  let getInstallAuthStatePath;
  let loadInstallAuthStateFromDisk;
  let saveInstallAuthStateToDisk;

  beforeEach(async () => {
    jest.resetModules();
    userDataPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'windieos-ipc-persist-'));
    jest.doMock('electron', () => ({
      app: {
        getPath: jest.fn(() => userDataPath),
      },
    }), { virtual: true });
    ({ app } = require('electron'));
    ({
      loadDesktopUiConfigFromDisk,
      saveDesktopUiConfigToDisk,
    } = require('../../frontend/src/main/ipc/ipc_frontend_config.cjs'));
    ({
      getInstallAuthStatePath,
      loadInstallAuthStateFromDisk,
      saveInstallAuthStateToDisk,
    } = require('../../frontend/src/main/ipc/ipc_install_auth_state.cjs'));
  });

  afterEach(async () => {
    await fs.promises.rm(userDataPath, { recursive: true, force: true });
    app.getPath.mockReset();
    jest.dontMock('electron');
  });

  test('desktop UI config saves are serialized with last writer winning', async () => {
    const log = jest.fn();
    const first = { model_mode: 'local', sequence: 1 };
    const second = { model_mode: 'cloud', sequence: 2 };

    const results = await Promise.all([
      saveDesktopUiConfigToDisk(first, log),
      saveDesktopUiConfigToDisk(second, log),
    ]);

    expect(results).toEqual([{ success: true }, { success: true }]);
    await expect(loadDesktopUiConfigFromDisk(log)).resolves.toEqual(second);
    await expect(fs.promises.readdir(userDataPath)).resolves.toEqual(['frontend-config.json']);
  });

  test('install auth saves are serialized with last writer winning', async () => {
    const log = jest.fn();
    const first = {
      installToken: 'token-first',
      userId: 'user-first',
      installId: 'install-first',
    };
    const second = {
      installToken: 'token-second',
      userId: 'user-second',
      installId: 'install-second',
    };

    const results = await Promise.all([
      saveInstallAuthStateToDisk(first, log),
      saveInstallAuthStateToDisk(second, log),
    ]);

    expect(results).toEqual([
      { success: true, state: first },
      { success: true, state: second },
    ]);
    await expect(loadInstallAuthStateFromDisk(log)).resolves.toEqual(second);
    expect(path.basename(getInstallAuthStatePath())).toBe('install-auth.json');
    await expect(fs.promises.readdir(userDataPath)).resolves.toEqual(['install-auth.json']);
  });
});
