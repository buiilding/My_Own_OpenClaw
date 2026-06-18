/**
 * Defines workspace settings tab configuration for the renderer UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopRuntimeSkin } from '../../../../../app/skin/desktopRuntimeSkin';
import { IpcBridge, ON_CHANNELS } from '../../../../../infrastructure/ipc/bridge';
import {
  fetchActiveWorkspaceSelection,
  requestActiveWorkspaceSelection,
} from '../../../../../infrastructure/workspace/workspaceAccess';

const workspaceSettingsSkin = desktopRuntimeSkin.settings.workspace;

function workspaceStateMatches(currentWorkspace, nextWorkspace) {
  return (
    currentWorkspace?.activeWorkspaceName === nextWorkspace?.activeWorkspaceName
    && currentWorkspace?.activeWorkspacePath === nextWorkspace?.activeWorkspacePath
  );
}

function WorkspaceSettingsTab() {
  const [activeWorkspace, setActiveWorkspace] = useState(() => ({
    activeWorkspaceName: '',
    activeWorkspacePath: '',
  }));
  const [isSelectingWorkspace, setIsSelectingWorkspace] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState('success');
  const activeWorkspaceRef = useRef(activeWorkspace);

  useEffect(() => {
    let cancelled = false;

    const applyWorkspace = (nextWorkspace) => {
      if (workspaceStateMatches(activeWorkspaceRef.current, nextWorkspace)) {
        return;
      }
      activeWorkspaceRef.current = nextWorkspace;
      setActiveWorkspace(nextWorkspace);
    };

    const refreshWorkspace = async () => {
      try {
        const result = await fetchActiveWorkspaceSelection();
        if (!cancelled) {
          applyWorkspace(result.workspace);
        }
      } catch (_error) {
        if (!cancelled) {
          applyWorkspace({
            activeWorkspaceName: '',
            activeWorkspacePath: '',
          });
        }
      }
    };

    void refreshWorkspace();

    const removeWorkspaceListener = IpcBridge.on(
      ON_CHANNELS.WORKSPACE_ACCESS_UPDATED,
      (payload = {}) => {
        applyWorkspace({
          activeWorkspaceName: typeof payload?.workspaceName === 'string' ? payload.workspaceName : '',
          activeWorkspacePath: typeof payload?.workspacePath === 'string' ? payload.workspacePath : '',
        });
      },
    );

    return () => {
      cancelled = true;
      removeWorkspaceListener?.();
    };
  }, []);

  const handleChangeWorkspace = useCallback(async () => {
    setIsSelectingWorkspace(true);
    setStatusMessage('');
    try {
      const result = await requestActiveWorkspaceSelection();
      if (result?.status?.granted === true) {
        activeWorkspaceRef.current = result.workspace;
        setActiveWorkspace(result.workspace);
        setStatusTone('success');
        setStatusMessage(result.workspace.activeWorkspaceName
          ? `Active workspace set to ${result.workspace.activeWorkspaceName}.`
          : workspaceSettingsSkin.updatedFallback);
      }
    } catch (error) {
      setStatusTone('error');
      setStatusMessage(error?.message || workspaceSettingsSkin.updateFailureFallback);
    } finally {
      setIsSelectingWorkspace(false);
    }
  }, []);

  return (
    <div className="clone-settings-general">
      <h2>{workspaceSettingsSkin.title}</h2>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-action">
        <div>
          <span>{workspaceSettingsSkin.activeWorkspaceLabel}</span>
          <p>{workspaceSettingsSkin.description}</p>
          <p className="clone-settings-workspace-path">
            {activeWorkspace.activeWorkspacePath || workspaceSettingsSkin.emptyWorkspace}
          </p>
        </div>
        <button
          type="button"
          className="clone-settings-secondary-button"
          onClick={() => {
            void handleChangeWorkspace();
          }}
          disabled={isSelectingWorkspace}
        >
          {isSelectingWorkspace ? workspaceSettingsSkin.selectingWorkspaceLabel : workspaceSettingsSkin.changeWorkspaceLabel}
        </button>
      </div>

      {statusMessage ? (
        <p className={`clone-settings-action-status clone-settings-action-status-${statusTone}`}>
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}

export default WorkspaceSettingsTab;
