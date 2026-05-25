import { useEffect, useMemo, useState } from 'react';
import PermissionStatusBadge from '../../../../permissions/components/PermissionStatusBadge';
import { usePermissionStore } from '../../../../permissions/stores/permissionStore';
import { applyPermissionGrantEffects } from '../../../../permissions/utils/permissionGrantEffects';
import { useAppConfigContext } from '../../../../../app/providers/AppContextHooks';

const BROWSER_PERMISSION_ID = 'browser_automation';

function BrowserSettingsTab() {
  const bootstrapped = usePermissionStore((state) => state.bootstrapped);
  const isLoading = usePermissionStore((state) => state.isLoading);
  const permissions = usePermissionStore((state) => state.permissions);
  const statusesByPermissionId = usePermissionStore((state) => state.statusesByPermissionId);
  const error = usePermissionStore((state) => state.error);
  const bootstrapPermissions = usePermissionStore((state) => state.bootstrapPermissions);
  const requestPermission = usePermissionStore((state) => state.requestPermission);
  const runPermissionProbe = usePermissionStore((state) => state.runPermissionProbe);
  const { updateConfig } = useAppConfigContext();
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
  const [statusOverride, setStatusOverride] = useState(null);
  const [openBrowserError, setOpenBrowserError] = useState('');

  const browserPermission = useMemo(() => (
    permissions.find((permission) => permission?.permission_id === BROWSER_PERMISSION_ID) || {
      permission_id: BROWSER_PERMISSION_ID,
      label: 'Browser automation',
      access_kind: 'app_capability',
    }
  ), [permissions]);
  const storedStatus = statusesByPermissionId[BROWSER_PERMISSION_ID] || null;
  const effectiveStatus = statusOverride || storedStatus;
  const statusReason = typeof effectiveStatus?.reason === 'string' ? effectiveStatus.reason.trim() : '';
  const remediation = typeof effectiveStatus?.details?.remediation === 'string'
    ? effectiveStatus.details.remediation.trim()
    : '';

  useEffect(() => {
    if (!bootstrapped && !isLoading) {
      void bootstrapPermissions();
    }
  }, [bootstrapPermissions, bootstrapped, isLoading]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    setStatusOverride(null);
    void runPermissionProbe(BROWSER_PERMISSION_ID);
  }, [bootstrapped, runPermissionProbe]);

  const handleOpenBrowser = async () => {
    if (isOpeningBrowser) {
      return;
    }

    setIsOpeningBrowser(true);
    setStatusOverride(null);
    setOpenBrowserError('');
    try {
      const status = await requestPermission(BROWSER_PERMISSION_ID);
      if (status) {
        setStatusOverride(status);
        applyPermissionGrantEffects({
          permissionId: BROWSER_PERMISSION_ID,
          status,
          updateConfig,
        });
      }
    } catch (err) {
      const message = err?.message || 'Unable to open Windie Browser.';
      setOpenBrowserError(`Unable to open Windie Browser: ${message}`);
    } finally {
      setIsOpeningBrowser(false);
    }
  };

  return (
    <div className="clone-settings-general">
      <h2>Browser</h2>

      <div className="clone-settings-row clone-settings-row-rich">
        <div>
          <div className="clone-settings-browser-title-row">
            <span>Windie Browser</span>
            <PermissionStatusBadge
              permission={browserPermission}
              status={effectiveStatus?.status}
            />
          </div>
          <p>
            Open the dedicated browser profile WindieOS uses for sign-in state, browsing,
            navigation, and web tasks.
          </p>
          {statusReason ? (
            <p className="clone-settings-browser-status">{statusReason}</p>
          ) : null}
          {remediation ? (
            <p className="clone-settings-inline-warning">{remediation}</p>
          ) : null}
          {openBrowserError ? (
            <p className="clone-settings-action-status clone-settings-action-status-error">{openBrowserError}</p>
          ) : null}
          {!statusReason && !openBrowserError && error ? (
            <p className="clone-settings-action-status clone-settings-action-status-error">{error}</p>
          ) : null}
        </div>
      </div>

      <div className="clone-settings-row clone-settings-row-rich clone-settings-row-action">
        <div>
          <span>Open Windie Browser</span>
          <p>
            Reopen the persistent browser window WindieOS manages so you can sign in or verify the
            session it should reuse later.
          </p>
        </div>
        <button
          type="button"
          className="clone-settings-primary-button"
          onClick={() => {
            void handleOpenBrowser();
          }}
          disabled={isLoading || isOpeningBrowser}
        >
          {isOpeningBrowser ? 'Opening...' : 'Open Windie Browser'}
        </button>
      </div>
    </div>
  );
}

export default BrowserSettingsTab;
