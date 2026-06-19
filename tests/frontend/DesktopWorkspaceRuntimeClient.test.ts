/**
 * Covers desktop workspace runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
let subscribedListener: ((payload?: unknown) => void) | null = null;

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (_channel: string, listener: (payload?: unknown) => void) => {
      subscribedListener = listener;
      return () => {
        subscribedListener = null;
      };
    },
  },
  INVOKE_CHANNELS: {
    CHECK_PERMISSION: 'check-permission',
    REQUEST_PERMISSION: 'request-permission',
    SET_ACTIVE_WORKSPACE: 'set-active-workspace',
  },
  ON_CHANNELS: {
    WORKSPACE_ACCESS_UPDATED: 'workspace-access-updated',
  },
}));

import {
  DesktopWorkspaceRuntimeClient,
  areActiveWorkspaceSelectionsEqual,
  normalizeWorkspaceAccessUpdatedPayload,
} from '../../frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient';

describe('DesktopWorkspaceRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    subscribedListener = null;
  });

  test('normalizes workspace access update payloads at the runtime boundary', () => {
    expect(normalizeWorkspaceAccessUpdatedPayload({
      granted: true,
      source: 'workspace_picker',
      workspacePath: '/repo/WindieOS/',
    })).toEqual({
      granted: true,
      source: 'workspace_picker',
      isWorkspacePickerSelection: true,
      workspaceName: 'WindieOS',
      workspacePath: '/repo/WindieOS/',
      workspace: {
        activeWorkspaceName: 'WindieOS',
        activeWorkspacePath: '/repo/WindieOS/',
        selectedPaths: ['/repo/WindieOS/'],
      },
    });

    expect(normalizeWorkspaceAccessUpdatedPayload({
      granted: true,
      source: 'startup_sync',
      workspacePath: '/repo/WindieOS',
    })).toEqual({
      granted: true,
      source: 'startup_sync',
      isWorkspacePickerSelection: false,
      workspaceName: 'WindieOS',
      workspacePath: '/repo/WindieOS',
      workspace: {
        activeWorkspaceName: 'WindieOS',
        activeWorkspacePath: '/repo/WindieOS',
        selectedPaths: ['/repo/WindieOS'],
      },
    });

    expect(normalizeWorkspaceAccessUpdatedPayload(null)).toEqual({
      granted: false,
      source: '',
      isWorkspacePickerSelection: false,
      workspaceName: '',
      workspacePath: '',
      workspace: {
        activeWorkspaceName: '',
        activeWorkspacePath: '',
        selectedPaths: [],
      },
    });
  });

  test('compares active workspace selections by value-level name and path', () => {
    expect(areActiveWorkspaceSelectionsEqual(
      {
        activeWorkspaceName: 'WindieOS',
        activeWorkspacePath: '/repo/WindieOS',
        selectedPaths: ['/repo/WindieOS'],
      },
      {
        activeWorkspaceName: 'WindieOS',
        activeWorkspacePath: '/repo/WindieOS',
        selectedPaths: ['/repo/WindieOS', '/ignored'],
      },
    )).toBe(true);
    expect(
      DesktopWorkspaceRuntimeClient.areActiveWorkspaceSelectionsEqual(
        {
          activeWorkspaceName: 'WindieOS',
          activeWorkspacePath: '/repo/WindieOS',
        },
        {
          activeWorkspaceName: 'frontend',
          activeWorkspacePath: '/repo/WindieOS/frontend',
        },
      ),
    ).toBe(false);
    expect(areActiveWorkspaceSelectionsEqual(null, null)).toBe(true);
  });

  test('workspace access subscriptions emit normalized workspace selections', () => {
    const updates: unknown[] = [];
    const unsubscribe = DesktopWorkspaceRuntimeClient.onWorkspaceAccessUpdated(payload => {
      updates.push(payload);
    });

    subscribedListener?.({
      granted: true,
      source: 'workspace_picker',
      workspaceName: 'Repo',
      workspacePath: '/tmp/repo',
    });

    expect(updates).toEqual([{
      granted: true,
      source: 'workspace_picker',
      isWorkspacePickerSelection: true,
      workspaceName: 'Repo',
      workspacePath: '/tmp/repo',
      workspace: {
        activeWorkspaceName: 'Repo',
        activeWorkspacePath: '/tmp/repo',
        selectedPaths: ['/tmp/repo'],
      },
    }]);

    unsubscribe?.();
    expect(subscribedListener).toBeNull();
  });

  test('fetches active workspace selections as value-level results', async () => {
    mockInvoke.mockResolvedValue({
      success: true,
      data: {
        status: {
          permission_id: 'filesystem_workspace_access',
          granted: true,
          details: {
            selected_paths: ['/tmp/repo'],
          },
        },
      },
    });

    await expect(DesktopWorkspaceRuntimeClient.fetchActiveWorkspace()).resolves.toEqual({
      activeWorkspaceName: 'repo',
      activeWorkspacePath: '/tmp/repo',
      selectedPaths: ['/tmp/repo'],
    });
    expect(mockInvoke).toHaveBeenCalledWith('check-permission', {
      permissionId: 'filesystem_workspace_access',
    });
  });

  test('requests granted active workspace selections as workspace values', async () => {
    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        status: {
          permission_id: 'filesystem_workspace_access',
          granted: true,
          details: {
            selected_paths: ['/tmp/granted-repo'],
          },
        },
      },
    });

    await expect(DesktopWorkspaceRuntimeClient.requestGrantedActiveWorkspace()).resolves.toEqual({
      activeWorkspaceName: 'granted-repo',
      activeWorkspacePath: '/tmp/granted-repo',
      selectedPaths: ['/tmp/granted-repo'],
    });

    mockInvoke.mockResolvedValueOnce({
      success: true,
      data: {
        status: {
          permission_id: 'filesystem_workspace_access',
          granted: false,
          details: {
            selected_paths: [],
          },
        },
      },
    });

    await expect(DesktopWorkspaceRuntimeClient.requestGrantedActiveWorkspace()).resolves.toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('request-permission', {
      permissionId: 'filesystem_workspace_access',
    });
  });

  test('workspace selection subscriptions emit workspace values and picker state', () => {
    const updates: unknown[] = [];
    const unsubscribe = DesktopWorkspaceRuntimeClient.onWorkspaceSelectionUpdated(
      (workspace, isWorkspacePickerSelection) => {
        updates.push({ workspace, isWorkspacePickerSelection });
      },
    );

    subscribedListener?.({
      granted: true,
      source: 'workspace_picker',
      workspaceName: 'Repo',
      workspacePath: '/tmp/repo',
    });

    expect(updates).toEqual([{
      workspace: {
        activeWorkspaceName: 'Repo',
        activeWorkspacePath: '/tmp/repo',
        selectedPaths: ['/tmp/repo'],
      },
      isWorkspacePickerSelection: true,
    }]);

    unsubscribe?.();
    expect(subscribedListener).toBeNull();
  });

  test('active workspace subscriptions emit only workspace values', () => {
    const updates: unknown[] = [];
    const unsubscribe = DesktopWorkspaceRuntimeClient.onActiveWorkspaceUpdated(workspace => {
      updates.push(workspace);
    });

    subscribedListener?.({
      granted: true,
      source: 'startup_sync',
      workspaceName: 'Repo',
      workspacePath: '/tmp/repo',
    });

    expect(updates).toEqual([{
      activeWorkspaceName: 'Repo',
      activeWorkspacePath: '/tmp/repo',
      selectedPaths: ['/tmp/repo'],
    }]);

    unsubscribe?.();
    expect(subscribedListener).toBeNull();
  });
});
