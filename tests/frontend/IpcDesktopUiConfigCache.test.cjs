/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createDesktopUiConfigCache,
} = require('../../frontend/src/main/ipc/ipc_desktop_ui_config_cache.cjs');

describe('ipc_desktop_ui_config_cache', () => {
  test('stores raw config and returns cloned snapshots only for valid payloads', () => {
    const isValidConfigPayload = jest.fn((config) => (
      Boolean(config) && typeof config === 'object' && !Array.isArray(config)
    ));
    const initialConfig = { selected_model_id: 'model-1' };
    const cache = createDesktopUiConfigCache({
      initialConfig,
      isValidConfigPayload,
    });

    expect(cache.getRaw()).toBe(initialConfig);
    expect(cache.getSnapshot()).toEqual(initialConfig);
    expect(cache.getSnapshot()).not.toBe(initialConfig);

    const nextConfig = { model_provider: 'openai' };
    cache.set(nextConfig);
    expect(cache.getRaw()).toBe(nextConfig);
    expect(cache.getSnapshot()).toEqual(nextConfig);

    cache.set(['invalid']);
    expect(cache.getRaw()).toEqual(['invalid']);
    expect(cache.getSnapshot()).toBeNull();

    cache.reset();
    expect(cache.getRaw()).toBeNull();
    expect(cache.getSnapshot()).toBeNull();
  });

  test('ipc.cjs delegates cached desktop UI config state to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_desktop_ui_config_cache.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createDesktopUiConfigCache({');
    expect(mainSource).toContain('desktopUiConfigCache.getRaw()');
    expect(mainSource).toContain('desktopUiConfigCache.set(config)');
    expect(mainSource).toContain('desktopUiConfigCache.getSnapshot()');
    expect(mainSource).not.toContain('let latestDesktopUiConfig = null');
    expect(mainSource).not.toContain('latestDesktopUiConfig = config');
    expect(helperSource).toContain('let latestDesktopUiConfig = initialConfig;');
  });
});
