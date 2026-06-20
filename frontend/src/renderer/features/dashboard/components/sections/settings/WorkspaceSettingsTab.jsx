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
    <div className="settings-surface-general">
      <h2>{workspaceSettingsSkin.title}</h2>

      <div className="settings-surface-row settings-surface-row-rich settings-surface-row-action">
        <div>
          <span>{workspaceSettingsSkin.activeWorkspaceLabel}</span>
          <p>{workspaceSettingsSkin.description}</p>
          <p className="settings-surface-workspace-path">
            {activeWorkspacePresentation.pathText}
          </p>
        </div>
        <button
          type="button"
          className="settings-surface-secondary-button"
          onClick={() => {
            void handleChangeWorkspace();
          }}
          disabled={isSelectingWorkspace}
        >
          {isSelectingWorkspace ? workspaceSettingsSkin.selectingWorkspaceLabel : workspaceSettingsSkin.changeWorkspaceLabel}
        </button>
      </div>

      {statusMessage ? (
        <p className={`settings-surface-action-status settings-surface-action-status-${statusTone}`}>
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}

export default WorkspaceSettingsTab;
