/** @jest-environment node */

const path = require('path');

const {
  createPermissionStateStore,
} = require('../../src/main/permissions/permission_state_store.cjs');

function createMemoryFs() {
  const files = new Map();
  return {
    existsSync(filePath) {
      return files.has(filePath);
    },
    promises: {
      mkdir: jest.fn(async () => {}),
      readFile: jest.fn(async (filePath) => files.get(filePath)),
      writeFile: jest.fn(async (filePath, contents) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        files.set(filePath, contents);
      }),
      rename: jest.fn(async (tempPath, statePath) => {
        files.set(statePath, files.get(tempPath));
        files.delete(tempPath);
      }),
    },
  };
}

describe('permission_state_store', () => {
  test('uses generic fallback state filename when user data path is unavailable', () => {
    const permissionStateStoreModule = require('../../src/main/permissions/permission_state_store.cjs');
    const store = createPermissionStateStore({});

    expect(permissionStateStoreModule.resolveStatePath).toBeUndefined();
    expect(store.resolveStatePath()).toBe(path.join(process.cwd(), '.desktop-runtime-permission-state.json'));
  });

  test('preserves independent concurrent permission updates', async () => {
    const fs = createMemoryFs();
    const statePath = path.join('/tmp', 'permission-state.json');
    const store = createPermissionStateStore({ fs, statePath });

    await Promise.all([
      store.set('screen_capture', {
        granted: true,
        source: 'system',
        updated_at: '2026-05-24T00:00:00.000Z',
        selected_paths: [],
        details: { reason: 'probe' },
      }),
      store.set('filesystem_workspace_access', {
        granted: true,
        source: 'app',
        updated_at: '2026-05-24T00:00:01.000Z',
        selected_paths: ['/workspace'],
        details: { reason: 'picker' },
      }),
    ]);

    expect(await store.get('screen_capture')).toMatchObject({
      granted: true,
      source: 'system',
    });
    expect(await store.get('filesystem_workspace_access')).toMatchObject({
      granted: true,
      source: 'app',
      selected_paths: ['/workspace'],
    });
  });
});
