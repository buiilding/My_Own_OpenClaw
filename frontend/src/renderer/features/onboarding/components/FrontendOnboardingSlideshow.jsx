import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import MainWindowControls from '../../../components/MainWindowControls';
import { useMainWindowControls } from '../../../hooks/useMainWindowControls';
import { getAgentStopShortcutLabel } from '../../../infrastructure/shortcuts/agentStopShortcut';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { usePermissionStore } from '../../permissions/stores/permissionStore';

function FrontendOnboardingSlideshow({ onComplete, stopAgentShortcutLabel }) {
  const resolvedStopShortcutLabel = stopAgentShortcutLabel || getAgentStopShortcutLabel();
  const bootstrapped = usePermissionStore((state) => state.bootstrapped);
  const isLoading = usePermissionStore((state) => state.isLoading);
  const permissions = usePermissionStore((state) => state.permissions);
  const statusesByPermissionId = usePermissionStore((state) => state.statusesByPermissionId);
  const error = usePermissionStore((state) => state.error);
  const bootstrapPermissions = usePermissionStore((state) => state.bootstrapPermissions);
  const requestPermission = usePermissionStore((state) => state.requestPermission);
  const { updateConfig } = useAppConfigContext();
  const startupMaximizeRequestedRef = useRef(false);
  const {
    handleWindowMinimize,
    handleWindowToggleMaximize,
    handleWindowClose,
    showMainWindow,
  } = useMainWindowControls({ warningPrefix: 'FrontendOnboardingSlideshow' });
  const slides = useMemo(() => ([
    {
      id: 'permissions',
      title: 'Grant access to your computer',
      body: 'Allow the requested permissions so WindieOS can capture screen state and safely run actions for you.',
    },
    {
      id: 'stop-flow',
      title: 'Stop the agent during loops',
      body: 'Press this keybind to stop the agent immediately globally.',
      emphasisLabel: 'Keybind',
      emphasisValue: resolvedStopShortcutLabel,
    },
  ]), [resolvedStopShortcutLabel]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [pendingPermissionId, setPendingPermissionId] = useState('');

  const activeSlide = slides[activeSlideIndex];
  const isLastSlide = activeSlideIndex === slides.length - 1;
  const isPermissionSlide = activeSlide.id === 'permissions';
  const isStopFlowSlide = activeSlide.id === 'stop-flow';

  useEffect(() => {
    if (isPermissionSlide && !bootstrapped && !isLoading) {
      void bootstrapPermissions();
    }
  }, [bootstrapPermissions, bootstrapped, isLoading, isPermissionSlide]);

  useEffect(() => {
    if (startupMaximizeRequestedRef.current) {
      return;
    }
    startupMaximizeRequestedRef.current = true;
    void showMainWindow({ focus: true, maximize: true });
  }, [showMainWindow]);

  async function handleGrantPermission(permissionId) {
    if (!permissionId) {
      return;
    }
    setPendingPermissionId(permissionId);
    try {
      const status = await requestPermission(permissionId);
      if (
        permissionId === 'browser_automation'
        && status?.granted === true
        && typeof updateConfig === 'function'
      ) {
        updateConfig({ browser_automation_enabled: true });
      }
    } finally {
      setPendingPermissionId('');
    }
  }

  return (
    <div className="frontend-onboarding-shell">
      <div className="frontend-onboarding-window-chrome">
        <MainWindowControls
          className="frontend-onboarding-window-controls"
          onMinimize={handleWindowMinimize}
          onToggleMaximize={handleWindowToggleMaximize}
          onClose={handleWindowClose}
        />
      </div>
      <section
        className={[
          'frontend-onboarding-card',
          isPermissionSlide ? 'frontend-onboarding-card-permissions' : '',
        ].join(' ').trim()}
        aria-label="WindieOS onboarding"
        role="dialog"
        aria-modal="true"
      >
        <p className="frontend-onboarding-progress">
          Step {activeSlideIndex + 1} of {slides.length}
        </p>
        <h1 className="frontend-onboarding-title">{activeSlide.title}</h1>
        <p className="frontend-onboarding-body">{activeSlide.body}</p>
        {isPermissionSlide ? (
          <div className="frontend-onboarding-permissions-section">
            <div className="frontend-onboarding-permissions-list">
              {permissions.map((permission) => {
                const status = statusesByPermissionId[permission.permission_id];
                const isGranted = status?.granted === true || status?.status === 'granted';
                const isPending = pendingPermissionId === permission.permission_id;
                const isBrowserAutomation = permission.permission_id === 'browser_automation';
                return (
                  <article
                    key={permission.permission_id}
                    className="frontend-onboarding-permission-row"
                  >
                    <div className="frontend-onboarding-permission-copy">
                      <h2>{permission.label}</h2>
                      <p title={permission.description}>{permission.description}</p>
                    </div>
                    {isGranted ? (
                      <div className="frontend-onboarding-permission-granted" aria-label="Granted">
                        <span className="frontend-onboarding-permission-granted-icon" aria-hidden="true">✓</span>
                        <span>Granted</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="frontend-onboarding-button primary"
                        onClick={() => {
                          void handleGrantPermission(permission.permission_id);
                        }}
                        disabled={isLoading || isPending}
                      >
                        {isPending
                          ? (isBrowserAutomation ? 'Enabling...' : 'Requesting...')
                          : (isBrowserAutomation ? 'Enable' : 'Grant')}
                      </button>
                    )}
                  </article>
                );
              })}
              {bootstrapped && permissions.length === 0 ? (
                <p className="frontend-onboarding-permission-empty">
                  No permission items were returned by the manifest.
                </p>
              ) : null}
            </div>
            {error ? (
              <p className="frontend-onboarding-permission-error">{error}</p>
            ) : null}
          </div>
        ) : isStopFlowSlide ? (
          <div className="frontend-onboarding-stop-flow">
            <span className="frontend-onboarding-stop-flow-copy">
              Use this anytime an agent loop needs to end right away.
            </span>
            <div
              className="frontend-onboarding-stop-flow-keybind"
              aria-label={`Stop shortcut ${activeSlide.emphasisValue}`}
            >
              <span className="frontend-onboarding-stop-flow-keybind-label">
                {activeSlide.emphasisLabel}
              </span>
              <kbd className="frontend-onboarding-stop-flow-keycap">{activeSlide.emphasisValue}</kbd>
            </div>
          </div>
        ) : (
          <div className="frontend-onboarding-emphasis">
            <span className="frontend-onboarding-emphasis-label">{activeSlide.emphasisLabel}</span>
            <span className="frontend-onboarding-emphasis-value">{activeSlide.emphasisValue}</span>
          </div>
        )}
        <div className="frontend-onboarding-actions">
          {activeSlideIndex > 0 ? (
            <button
              type="button"
              className="frontend-onboarding-button secondary"
              onClick={() => setActiveSlideIndex((current) => Math.max(current - 1, 0))}
            >
              Back
            </button>
          ) : (
            <span aria-hidden="true" className="frontend-onboarding-action-spacer" />
          )}
          {isLastSlide ? (
            <button
              type="button"
              className="frontend-onboarding-button primary"
              onClick={onComplete}
            >
              Start WindieOS
            </button>
          ) : (
            <button
              type="button"
              className="frontend-onboarding-button primary"
              onClick={() => setActiveSlideIndex((current) => Math.min(current + 1, slides.length - 1))}
            >
              Next
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

FrontendOnboardingSlideshow.propTypes = {
  onComplete: PropTypes.func.isRequired,
  stopAgentShortcutLabel: PropTypes.string,
};

export default FrontendOnboardingSlideshow;
