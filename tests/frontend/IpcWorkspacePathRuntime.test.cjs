/** @jest-environment node */

const workspacePathRuntimeModule = require('../../frontend/src/main/ipc/ipc_workspace_path_runtime.cjs');
const {
  createWorkspacePathRuntime,
  resolveWorkspacePathForAgentPayload,
} = workspacePathRuntimeModule;

describe('ipc_workspace_path_runtime', () => {
  test('normalizes optional workspace strings through the resolver', () => {
    expect(resolveWorkspacePathForAgentPayload({
      workspace_path: ' C:/repo ',
    }, {})).toBe('C:/repo');

    expect(resolveWorkspacePathForAgentPayload({
      workspace_path: '   ',
      workspacePath: 42,
    }, {})).toBeNull();

    expect(workspacePathRuntimeModule.normalizeOptionalString).toBeUndefined();
  });

  test('prefers command payload workspace path over desktop config fallback', () => {
    expect(resolveWorkspacePathForAgentPayload({
      workspace_path: ' C:/payload-snake ',
      workspacePath: 'C:/payload-camel',
    }, {
      workspace_path: 'C:/config-snake',
      workspacePath: 'C:/config-camel',
    })).toBe('C:/payload-snake');

    expect(resolveWorkspacePathForAgentPayload({
      workspacePath: ' C:/payload-camel ',
    }, {
      workspace_path: 'C:/config-snake',
    })).toBe('C:/payload-camel');
  });

  test('falls back to cached desktop config workspace path', () => {
    expect(resolveWorkspacePathForAgentPayload({}, {
      workspace_path: ' C:/config-snake ',
      workspacePath: 'C:/config-camel',
    })).toBe('C:/config-snake');

    expect(resolveWorkspacePathForAgentPayload({}, {
      workspacePath: ' C:/config-camel ',
    })).toBe('C:/config-camel');

    expect(resolveWorkspacePathForAgentPayload({}, {})).toBeNull();
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
