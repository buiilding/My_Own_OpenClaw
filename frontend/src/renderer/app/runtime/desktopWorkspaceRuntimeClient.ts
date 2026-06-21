/**
 * Coordinates desktop workspace selection commands and subscriptions for renderer clients.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../infrastructure/ipc/bridge';
import {
  areWorkspaceBindingsEqual,
  clearAllConversationWorkspaceBindings,
  clearConversationWorkspaceBinding,
  getConversationWorkspaceBinding,
  resolveConversationWorkspaceBinding,
  setConversationWorkspaceBinding,
  workspaceSelectionToBinding,
} from '../../infrastructure/workspace/conversationWorkspaceBinding';

export type DesktopWorkspaceAccessUpdatedPayload = {
  granted: boolean;
  source: string;
  isWorkspacePickerSelection: boolean;
  workspaceName: string;
  workspacePath: string;
  workspace: DesktopWorkspaceSelection;
};

export type DesktopWorkspaceSelection = {
  activeWorkspaceName: string;
  activeWorkspacePath: string;
  selectedPaths: string[];
};

export type DesktopWorkspacePresentationCopy = {
  emptyWorkspaceText?: string;
  updatedFallbackText?: string;
};

export type DesktopActiveWorkspacePresentation = {
  pathText: string;
  updateSuccessMessage: string;
};

export type DesktopWorkspaceSelectionResult = {
  status: Record<string, unknown> | null;
  workspace: DesktopWorkspaceSelection;
};

export type DesktopWorkspaceAccessUpdatedListener = (
  payload: DesktopWorkspaceAccessUpdatedPayload,
) => void;

export type DesktopWorkspaceSelectionUpdateListener = (
  workspace: DesktopWorkspaceSelection,
  isWorkspacePickerSelection: boolean,
) => void;

const WORKSPACE_ACCESS_PERMISSION_ID = 'filesystem_workspace_access';

function getEmptyActiveWorkspaceSelection(): DesktopWorkspaceSelection {
  return {
    activeWorkspaceName: '',
    activeWorkspacePath: '',
    selectedPaths: [],
  };
}

function getLastPathSegment(pathValue = ''): string {
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

function normalizeActiveWorkspace(statusPayload: Record<string, unknown> | null = null): DesktopWorkspaceSelection {
  const details = statusPayload?.details;
  const selectedPaths = (
    details && typeof details === 'object' && Array.isArray((details as { selected_paths?: unknown }).selected_paths)
      ? (details as { selected_paths: unknown[] }).selected_paths.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
      : []
  );
  if (statusPayload?.granted !== true || selectedPaths.length === 0) {
    return getEmptyActiveWorkspaceSelection();
  }

  const activeWorkspacePath = selectedPaths[0];
  return {
    activeWorkspaceName: getLastPathSegment(activeWorkspacePath) || activeWorkspacePath,
    activeWorkspacePath,
    selectedPaths,
  };
}

function extractWorkspaceStatus(result: unknown = null): Record<string, unknown> | null {
  const data = result && typeof result === 'object' ? (result as { data?: unknown }).data : null;
  if (!data || typeof data !== 'object') {
    return null;
  }
  const status = (data as { status?: unknown }).status;
  return status && typeof status === 'object' && !Array.isArray(status)
    ? status as Record<string, unknown>
    : null;
}

function selectionResultFromInvokeResult(result: unknown): DesktopWorkspaceSelectionResult {
  const status = extractWorkspaceStatus(result);
  return {
    status,
    workspace: normalizeActiveWorkspace(status),
  };
}

function isWorkspaceSelectionGranted(result: DesktopWorkspaceSelectionResult): boolean {
  return result.status?.granted === true;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeWorkspaceAccessUpdatedPayload(
  payload: unknown,
): DesktopWorkspaceAccessUpdatedPayload {
  const source = recordOrEmpty(payload);
  const workspacePath = typeof source.workspacePath === 'string' ? source.workspacePath : '';
  const explicitWorkspaceName = typeof source.workspaceName === 'string' ? source.workspaceName : '';
  const activeWorkspaceName = explicitWorkspaceName || getLastPathSegment(workspacePath) || '';
  const workspace = {
    activeWorkspaceName,
    activeWorkspacePath: workspacePath,
    selectedPaths: workspacePath ? [workspacePath] : [],
  };
  return {
    granted: source.granted === true,
    source: typeof source.source === 'string' ? source.source : '',
    isWorkspacePickerSelection: source.source === 'workspace_picker',
    workspaceName: activeWorkspaceName,
    workspacePath,
    workspace,
  };
}

function areActiveWorkspaceSelectionsEqual(
  currentWorkspace: unknown,
  nextWorkspace: unknown,
): boolean {
  const current = recordOrEmpty(currentWorkspace);
  const next = recordOrEmpty(nextWorkspace);
  return (
    current.activeWorkspaceName === next.activeWorkspaceName
    && current.activeWorkspacePath === next.activeWorkspacePath
  );
}

function getActiveWorkspacePresentation(
  workspace: unknown,
  copy: DesktopWorkspacePresentationCopy = {},
): DesktopActiveWorkspacePresentation {
  const source = recordOrEmpty(workspace);
  const activeWorkspaceName = typeof source.activeWorkspaceName === 'string'
    ? source.activeWorkspaceName.trim()
    : '';
  const activeWorkspacePath = typeof source.activeWorkspacePath === 'string'
    ? source.activeWorkspacePath.trim()
    : '';
  const emptyWorkspaceText = typeof copy.emptyWorkspaceText === 'string'
    ? copy.emptyWorkspaceText
    : '';
  const updatedFallbackText = typeof copy.updatedFallbackText === 'string'
    ? copy.updatedFallbackText
    : 'Workspace updated.';

  return {
    pathText: activeWorkspacePath || emptyWorkspaceText,
    updateSuccessMessage: activeWorkspaceName
      ? `Active workspace set to ${activeWorkspaceName}.`
      : updatedFallbackText,
  };
}

export const DesktopWorkspaceRuntimeClient = {
  getEmptyActiveWorkspaceSelection,

  async fetchActiveWorkspaceSelection(): Promise<DesktopWorkspaceSelectionResult> {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.CHECK_PERMISSION, {
      permissionId: WORKSPACE_ACCESS_PERMISSION_ID,
    });
    return selectionResultFromInvokeResult(result);
  },

  async fetchActiveWorkspace(): Promise<DesktopWorkspaceSelection> {
    const result = await DesktopWorkspaceRuntimeClient.fetchActiveWorkspaceSelection();
    return result.workspace;
  },

  async requestActiveWorkspaceSelection(): Promise<DesktopWorkspaceSelectionResult> {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.REQUEST_PERMISSION, {
      permissionId: WORKSPACE_ACCESS_PERMISSION_ID,
    });
    return selectionResultFromInvokeResult(result);
  },

  async requestGrantedActiveWorkspace(): Promise<DesktopWorkspaceSelection | null> {
    const result = await DesktopWorkspaceRuntimeClient.requestActiveWorkspaceSelection();
    return isWorkspaceSelectionGranted(result) ? result.workspace : null;
  },

  async setActiveWorkspaceSelection(workspacePath: string | null = null): Promise<DesktopWorkspaceSelectionResult> {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.SET_ACTIVE_WORKSPACE, {
      workspacePath: typeof workspacePath === 'string' ? workspacePath : null,
    });
    return selectionResultFromInvokeResult(result);
  },

  onWorkspaceAccessUpdated(listener: DesktopWorkspaceAccessUpdatedListener): (() => void) | undefined {
    if (!ON_CHANNELS?.WORKSPACE_ACCESS_UPDATED) {
      return undefined;
    }
    return IpcBridge.on(
      ON_CHANNELS.WORKSPACE_ACCESS_UPDATED,
      (payload?: unknown) => listener(normalizeWorkspaceAccessUpdatedPayload(payload)),
    );
  },

  onWorkspaceSelectionUpdated(
    listener: DesktopWorkspaceSelectionUpdateListener,
  ): (() => void) | undefined {
    return DesktopWorkspaceRuntimeClient.onWorkspaceAccessUpdated((payload) => {
      listener(payload.workspace, payload.isWorkspacePickerSelection);
    });
  },

  onActiveWorkspaceUpdated(
    listener: (workspace: DesktopWorkspaceSelection) => void,
  ): (() => void) | undefined {
    return DesktopWorkspaceRuntimeClient.onWorkspaceSelectionUpdated((workspace) => {
      listener(workspace);
    });
  },

  areActiveWorkspaceSelectionsEqual,

  getActiveWorkspacePresentation,

  workspaceSelectionToBinding,

  areWorkspaceBindingsEqual,

  getConversationWorkspaceBinding,

  setConversationWorkspaceBinding,

  clearConversationWorkspaceBinding,

  clearAllConversationWorkspaceBindings,

  resolveConversationWorkspaceBinding,
};
