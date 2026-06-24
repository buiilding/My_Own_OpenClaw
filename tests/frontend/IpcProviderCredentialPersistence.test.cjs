/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('IPC provider credential persistence', () => {
  let userDataPath;
  let app;
  let safeStorage;
  let loadDesktopUiConfigFromDisk;
  let saveDesktopUiConfigToDisk;

  beforeEach(async () => {
    jest.resetModules();
    userDataPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'project-alpha-provider-keys-'));
    jest.doMock('electron', () => ({
      app: {
        getPath: jest.fn(() => userDataPath),
      },
      safeStorage: {
        isEncryptionAvailable: jest.fn(() => true),
        encryptString: jest.fn((value) => Buffer.from(`encrypted:${value}`, 'utf8')),
        decryptString: jest.fn((value) => value.toString('utf8').replace(/^encrypted:/, '')),
      },
    }), { virtual: true });
    ({ app, safeStorage } = require('electron'));
    ({
      loadDesktopUiConfigFromDisk,
      saveDesktopUiConfigToDisk,
    } = require('../../frontend/src/main/ipc/ipc_desktop_ui_config.cjs'));
  });

  afterEach(async () => {
    await fs.promises.rm(userDataPath, { recursive: true, force: true });
    app.getPath.mockReset();
    safeStorage.isEncryptionAvailable.mockReset();
    safeStorage.encryptString.mockReset();
    safeStorage.decryptString.mockReset();
    jest.dontMock('electron');
  });

  test('stores provider API keys encrypted outside redacted desktop UI config', async () => {
    const log = jest.fn();
    const config = {
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: 'sk-ant-secret',
        },
      },
    };

    await expect(saveDesktopUiConfigToDisk(config, log)).resolves.toEqual({ success: true });

    const configRaw = await fs.promises.readFile(
      path.join(userDataPath, 'frontend-config.json'),
      'utf8',
    );
    expect(configRaw).not.toContain('sk-ant-secret');
    expect(JSON.parse(configRaw)).toEqual({
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: '',
        },
      },
    });

    const credentialRaw = await fs.promises.readFile(
      path.join(userDataPath, 'provider-credentials.json'),
      'utf8',
    );
    expect(credentialRaw).not.toContain('sk-ant-secret');
    expect(JSON.parse(credentialRaw).provider_api_keys.anthropic).toEqual({
      encoding: 'electron-safe-storage-v1',
      encrypted: Buffer.from('encrypted:sk-ant-secret', 'utf8').toString('base64'),
    });
    await expect(loadDesktopUiConfigFromDisk(log)).resolves.toEqual(config);
  });

  test('redacted provider key saves preserve encrypted keys and disabled saves clear them', async () => {
    const log = jest.fn();
    const initialConfig = {
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: 'sk-ant-secret',
        },
      },
    };

    await expect(saveDesktopUiConfigToDisk(initialConfig, log)).resolves.toEqual({ success: true });
    await expect(saveDesktopUiConfigToDisk({
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: '',
        },
      },
    }, log)).resolves.toEqual({ success: true });
    await expect(loadDesktopUiConfigFromDisk(log)).resolves.toEqual(initialConfig);

    await expect(saveDesktopUiConfigToDisk({
      provider_api_keys: {
        anthropic: {
          enabled: false,
          api_key: '',
        },
      },
    }, log)).resolves.toEqual({ success: true });
    await expect(loadDesktopUiConfigFromDisk(log)).resolves.toEqual({
      provider_api_keys: {
        anthropic: {
          enabled: false,
          api_key: '',
        },
      },
    });
  });
});
