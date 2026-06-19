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
});
