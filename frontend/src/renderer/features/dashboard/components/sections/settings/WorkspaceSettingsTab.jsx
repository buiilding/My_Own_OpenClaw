/**
 * Defines workspace settings tab configuration for the renderer UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopRuntimeSkin } from '../../../../../app/skin/desktopRuntimeSkin';
import { DesktopWorkspaceRuntimeClient } from '../../../../../app/runtime/desktopWorkspaceRuntimeClient';

const workspaceSettingsSkin = desktopRuntimeSkin.settings.workspace;

function getWorkspacePresentation(workspace) {
  return DesktopWorkspaceRuntimeClient.getActiveWorkspacePresentation(workspace, {
    emptyWorkspaceText: workspaceSettingsSkin.emptyWorkspace,
    updatedFallbackText: workspaceSettingsSkin.updatedFallback,
  });
}

function WorkspaceSettingsTab() {
  const [activeWorkspace, setActiveWorkspace] = useState(
    () => DesktopWorkspaceRuntimeClient.getEmptyActiveWorkspaceSelection(),
  );
  const [isSelectingWorkspace, setIsSelectingWorkspace] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState('success');
  const activeWorkspaceRef = useRef(activeWorkspace);
  const activeWorkspacePresentation = getWorkspacePresentation(activeWorkspace);

  useEffect(() => {
    let cancelled = false;

    const applyWorkspace = (nextWorkspace) => {
      if (
        DesktopWorkspaceRuntimeClient.areActiveWorkspaceSelectionsEqual(
          activeWorkspaceRef.current,
          nextWorkspace,
        )
      ) {
        return;
      }
      activeWorkspaceRef.current = nextWorkspace;
      setActiveWorkspace(nextWorkspace);
    };

    const refreshWorkspace = async () => {
      try {
        const nextWorkspace = await DesktopWorkspaceRuntimeClient.fetchActiveWorkspace();
        if (!cancelled) {
          applyWorkspace(nextWorkspace);
        }
      } catch (_error) {
        if (!cancelled) {
          applyWorkspace(DesktopWorkspaceRuntimeClient.getEmptyActiveWorkspaceSelection());
        }
      }
    };

    void refreshWorkspace();

    const removeWorkspaceListener = DesktopWorkspaceRuntimeClient.onActiveWorkspaceUpdated(applyWorkspace);

    return () => {
      cancelled = true;
      removeWorkspaceListener?.();
    };
  }, []);

  const handleChangeWorkspace = useCallback(async () => {
    setIsSelectingWorkspace(true);
    setStatusMessage('');
    try {
      const nextWorkspace = await DesktopWorkspaceRuntimeClient.requestGrantedActiveWorkspace();
      if (nextWorkspace) {
        activeWorkspaceRef.current = nextWorkspace;
        setActiveWorkspace(nextWorkspace);
        setStatusTone('success');
        setStatusMessage(getWorkspacePresentation(nextWorkspace).updateSuccessMessage);
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
            {activeWorkspacePresentation.pathText}
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
