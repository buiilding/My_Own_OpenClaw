/**
 * Provides the workspace access module for the renderer UI.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../ipc/bridge';

const WORKSPACE_ACCESS_PERMISSION_ID = 'filesystem_workspace_access';

function getLastPathSegment(pathValue = '') {
  if (typeof pathValue !== 'string') {
    return '';
  }
  const trimmed = pathValue.trim().replace(/[\\/]+$/, '');
  if (!trimmed) {
    return '';
  }
  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : trimmed;
}

function normalizeActiveWorkspace(statusPayload = null) {
  const selectedPaths = Array.isArray(statusPayload?.details?.selected_paths)
    ? statusPayload.details.selected_paths.filter((value) => typeof value === 'string' && value.trim())
    : [];
  if (statusPayload?.granted !== true || selectedPaths.length === 0) {
    return {
      activeWorkspaceName: '',
      activeWorkspacePath: '',
      selectedPaths: [],
    };
  }

  const activeWorkspacePath = selectedPaths[0];
  return {
    activeWorkspaceName: getLastPathSegment(activeWorkspacePath) || activeWorkspacePath,
    activeWorkspacePath,
    selectedPaths,
  };
}

function extractWorkspaceStatus(result = null) {
  return result?.data?.status && typeof result.data.status === 'object'
    ? result.data.status
    : null;
}

export async function fetchActiveWorkspaceSelection() {
  const result = await IpcBridge.invoke(INVOKE_CHANNELS.CHECK_PERMISSION, {
    permissionId: WORKSPACE_ACCESS_PERMISSION_ID,
  });
  const status = extractWorkspaceStatus(result);
  return {
    status,
    workspace: normalizeActiveWorkspace(status),
  };
}

export async function requestActiveWorkspaceSelection() {
  const result = await IpcBridge.invoke(INVOKE_CHANNELS.REQUEST_PERMISSION, {
    permissionId: WORKSPACE_ACCESS_PERMISSION_ID,
  });
  const status = extractWorkspaceStatus(result);
  return {
    status,
    workspace: normalizeActiveWorkspace(status),
  };
}

export async function setActiveWorkspaceSelection(workspacePath = null) {
  const result = await IpcBridge.invoke(INVOKE_CHANNELS.SET_ACTIVE_WORKSPACE, {
    workspacePath: typeof workspacePath === 'string' ? workspacePath : null,
  });
  const status = extractWorkspaceStatus(result);
  return {
    status,
    workspace: normalizeActiveWorkspace(status),
  };
}
