/** @jest-environment node */

const workspacePathRuntimeModule = require('../../src/main/ipc/ipc_workspace_path_runtime.cjs');
const {
  createWorkspacePathRuntime,
} = workspacePathRuntimeModule;

function createResolver(desktopUiConfig = {}) {
  return createWorkspacePathRuntime({
    getLatestDesktopUiConfig: () => desktopUiConfig,
  });
}

describe('ipc_workspace_path_runtime', () => {
  test('normalizes optional workspace strings through the resolver', () => {
    expect(createResolver().resolve({
      workspace_path: ' C:/repo ',
    })).toBe('C:/repo');

    expect(createResolver().resolve({
      workspace_path: '   ',
      workspacePath: 42,
    })).toBeNull();

    expect(workspacePathRuntimeModule.normalizeOptionalString).toBeUndefined();
    expect(workspacePathRuntimeModule.resolveWorkspacePathForAgentPayload).toBeUndefined();
  });

  test('prefers command payload workspace path over desktop config fallback', () => {
    expect(createResolver({
      workspace_path: 'C:/config-snake',
      workspacePath: 'C:/config-camel',
    }).resolve({
      workspace_path: ' C:/payload-snake ',
      workspacePath: 'C:/payload-camel',
    })).toBe('C:/payload-snake');

    expect(createResolver({
      workspace_path: 'C:/config-snake',
    }).resolve({
      workspacePath: ' C:/payload-camel ',
    })).toBe('C:/payload-camel');
  });

  test('falls back to cached desktop config workspace path', () => {
    expect(createResolver({
      workspace_path: ' C:/config-snake ',
      workspacePath: 'C:/config-camel',
    }).resolve({})).toBe('C:/config-snake');

    expect(createResolver({
      workspacePath: ' C:/config-camel ',
    }).resolve({})).toBe('C:/config-camel');

    expect(createResolver({}).resolve({})).toBeNull();
  });

  test('runtime resolves against the latest injected desktop config', () => {
    const configs = [
      { workspace_path: ' C:/first ' },
      { workspacePath: ' C:/second ' },
    ];
    const runtime = createWorkspacePathRuntime({
      getLatestDesktopUiConfig: jest.fn(() => configs.shift()),
    });

    expect(runtime.resolve({})).toBe('C:/first');
    expect(runtime.resolve({})).toBe('C:/second');
    expect(runtime.resolve({ workspace_path: ' C:/payload ' })).toBe('C:/payload');
  });
});
