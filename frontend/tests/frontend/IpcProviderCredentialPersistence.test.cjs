/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('IPC provider credential persistence', () => {
  let userDataPath;
  let app;
  let safeStorage;
  let hydrateProviderApiKeySecretsForBackendSettings;
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
    } = require('../../src/main/ipc/ipc_desktop_ui_config.cjs'));
    ({
      hydrateProviderApiKeySecretsForBackendSettings,
    } = require('../../src/main/ipc/ipc_provider_credentials_store.cjs'));
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
          has_saved_key: true,
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
    await expect(loadDesktopUiConfigFromDisk(log)).resolves.toEqual({
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: 'sk-ant-secret',
          has_saved_key: true,
        },
      },
    });
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
    await expect(loadDesktopUiConfigFromDisk(log)).resolves.toEqual({
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: 'sk-ant-secret',
          has_saved_key: true,
        },
      },
    });

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
          has_saved_key: false,
        },
      },
    });
  });

  test('clear_saved_key deletes encrypted keys while leaving provider enabled', async () => {
    const log = jest.fn();
    await expect(saveDesktopUiConfigToDisk({
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: 'sk-ant-secret',
        },
      },
    }, log)).resolves.toEqual({ success: true });

    await expect(saveDesktopUiConfigToDisk({
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: '',
          has_saved_key: false,
          clear_saved_key: true,
        },
      },
    }, log)).resolves.toEqual({ success: true });

    await expect(loadDesktopUiConfigFromDisk(log)).resolves.toEqual({
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: '',
          has_saved_key: false,
        },
      },
    });
  });

  test('backend settings hydration keeps missing encrypted provider keys redacted', () => {
    const log = jest.fn();
    const config = {
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: '',
          has_saved_key: true,
        },
      },
    };

    expect(hydrateProviderApiKeySecretsForBackendSettings(config, log)).toEqual({
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: '',
          has_saved_key: false,
        },
      },
    });
    expect(log).not.toHaveBeenCalled();
  });

  test('backend settings hydration keeps provider keys redacted when decrypt fails', async () => {
    const log = jest.fn();
    safeStorage.decryptString.mockImplementationOnce(() => {
      throw new Error('decrypt failed');
    });
    await fs.promises.writeFile(
      path.join(userDataPath, 'provider-credentials.json'),
      JSON.stringify({
        version: 1,
        provider_api_keys: {
          anthropic: {
            encoding: 'electron-safe-storage-v1',
            encrypted: Buffer.from('encrypted:sk-ant-secret', 'utf8').toString('base64'),
          },
        },
      }),
      'utf8',
    );
    const config = {
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: '',
          has_saved_key: true,
        },
      },
    };

    expect(hydrateProviderApiKeySecretsForBackendSettings(config, log)).toEqual({
      provider_api_keys: {
        anthropic: {
          enabled: true,
          api_key: '',
          has_saved_key: false,
        },
      },
    });
    expect(log).toHaveBeenCalledWith(
      "Failed to decrypt provider API key for 'anthropic': decrypt failed",
    );
  });
});
