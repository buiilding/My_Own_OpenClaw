import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import MainWindowControls from '../../../components/MainWindowControls';
import { useMainWindowControls } from '../../../hooks/useMainWindowControls';
import { getAgentStopShortcutLabel } from '../../../infrastructure/shortcuts/agentStopShortcut';
import { useAppConfigContext } from '../../../app/providers/AppContextHooks';
import { usePermissionStore } from '../../permissions/stores/permissionStore';
import {
  getPermissionActionLabel,
  getPermissionGrantedLabel,
  getPermissionKindLabel,
} from '../../permissions/utils/permissionPresentation';

function FrontendOnboardingSlideshow({ onComplete, stopAgentShortcutLabel }) {
  const resolvedStopShortcutLabel = stopAgentShortcutLabel || getAgentStopShortcutLabel();
  const stopShortcutSegments = useMemo(() => {
    const segments = resolvedStopShortcutLabel
      .split(/\s*\+\s*/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    return segments.length > 0 ? segments : [resolvedStopShortcutLabel];
  }, [resolvedStopShortcutLabel]);
  const bootstrapped = usePermissionStore((state) => state.bootstrapped);
  const isLoading = usePermissionStore((state) => state.isLoading);
  const permissions = usePermissionStore((state) => state.permissions);
  const statusesByPermissionId = usePermissionStore((state) => state.statusesByPermissionId);
  const error = usePermissionStore((state) => state.error);
  const missingRequiredPermissions = usePermissionStore((state) => state.missingRequiredPermissions);
  const bootstrapPermissions = usePermissionStore((state) => state.bootstrapPermissions);
  const completeOnboarding = usePermissionStore((state) => state.completeOnboarding);
  const requestPermission = usePermissionStore((state) => state.requestPermission);
  const { updateConfig } = useAppConfigContext();
  const startupMaximizeRequestedRef = useRef(false);
  const {
    handleWindowMinimize,
    handleWindowToggleMaximize,
    handleWindowClose,
    showMainWindow,
  } = useMainWindowControls({ warningPrefix: 'FrontendOnboardingSlideshow' });
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [pendingPermissionId, setPendingPermissionId] = useState('');
  const permissionSlides = permissions;
  const permissionSlideCount = permissionSlides.length > 0 ? permissionSlides.length : 1;
  const totalSlides = permissionSlideCount + 1;
  const isStopFlowSlide = activeSlideIndex >= permissionSlideCount;
  const isPermissionSlide = !isStopFlowSlide;
  const isLastSlide = activeSlideIndex === totalSlides - 1;
  const activePermission = isPermissionSlide && permissionSlides.length > 0
    ? permissionSlides[Math.min(activeSlideIndex, permissionSlides.length - 1)]
    : null;
  const activeSlideTitle = isPermissionSlide
    ? 'Set up system access'
    : 'Stop the agent during loops';
  const activeSlideBody = isPermissionSlide
    ? 'Review each item before you continue. Some are OS permissions, some are app capabilities, and some are workspace or runtime checks.'
    : 'Use this anytime an agent loop needs to end right away.';

  useEffect(() => {
    if (activeSlideIndex > totalSlides - 1) {
      setActiveSlideIndex(totalSlides - 1);
    }
  }, [activeSlideIndex, totalSlides]);
  const canStartWindieOs = bootstrapped && !isLoading;

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

  function handleComplete() {
    const completed = completeOnboarding();
    if (completed && typeof onComplete === 'function') {
      onComplete();
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
        <div className="frontend-onboarding-card-scroll-region">
          <p className="frontend-onboarding-progress">
            Step {activeSlideIndex + 1} of {totalSlides}
          </p>
          <h1 className="frontend-onboarding-title">{activeSlideTitle}</h1>
          <p className="frontend-onboarding-body">{activeSlideBody}</p>
          {isPermissionSlide ? (
            <div className="frontend-onboarding-permissions-section">
              {activePermission ? (
                <>
                  <div className="frontend-onboarding-permission-stage-meta">
                    <p className="frontend-onboarding-permission-stage-count">
                      Permission {activeSlideIndex + 1} of {permissionSlides.length}
                    </p>
                    <p className="frontend-onboarding-permission-stage-summary">
                      Grant what you want now. You can revisit the rest later in Settings.
                    </p>
                  </div>
                  <div className="frontend-onboarding-permissions-list single">
                    {(() => {
                      const status = statusesByPermissionId[activePermission.permission_id];
                      const statusReason = typeof status?.reason === 'string'
                        ? status.reason.trim()
                        : '';
                      const isGranted = status?.granted === true || status?.status === 'granted';
                      const isPending = pendingPermissionId === activePermission.permission_id;
                      const actionLabel = getPermissionActionLabel(activePermission);
                      const grantedLabel = getPermissionGrantedLabel(activePermission);
                      return (
                        <article
                          key={activePermission.permission_id}
                          className="frontend-onboarding-permission-row single"
                        >
                          <div className="frontend-onboarding-permission-copy">
                            <h2>{activePermission.label}</h2>
                            <p className="frontend-onboarding-permission-kind">{getPermissionKindLabel(activePermission)}</p>
                            <p>{activePermission.description}</p>
                            {statusReason ? (
                              <p className={`frontend-onboarding-permission-reason status-${status?.status || 'unknown'}`}>
                                {statusReason}
                              </p>
                            ) : null}
                          </div>
                          {isGranted ? (
                            <div className="frontend-onboarding-permission-granted" aria-label={grantedLabel}>
                              <span className="frontend-onboarding-permission-granted-icon" aria-hidden="true">✓</span>
                              <span>{grantedLabel}</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="frontend-onboarding-button primary"
                              onClick={() => {
                                void handleGrantPermission(activePermission.permission_id);
                              }}
                              disabled={isLoading || isPending}
                            >
                              {isPending ? `${actionLabel}...` : actionLabel}
                            </button>
                          )}
                        </article>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <p className="frontend-onboarding-permission-empty">
                  {bootstrapped ? 'No permission items were returned by the manifest.' : 'Loading permissions...'}
                </p>
              )}
            </div>
          ) : isStopFlowSlide ? (
            <div className="frontend-onboarding-stop-flow">
              <div
                className="frontend-onboarding-stop-flow-keybind"
                aria-label={`Stop shortcut ${resolvedStopShortcutLabel}`}
              >
                <span className="frontend-onboarding-stop-flow-keybind-label">
                  Keybind
                </span>
                <div className="frontend-onboarding-stop-flow-keycap-row" aria-hidden="true">
                  {stopShortcutSegments.map((segment, index) => (
                    <Fragment key={`${segment}-${index}`}>
                      {index > 0 ? (
                        <span className="frontend-onboarding-stop-flow-keycap-separator">+</span>
                      ) : null}
                      <kbd className="frontend-onboarding-stop-flow-keycap">{segment}</kbd>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="frontend-onboarding-emphasis">
              <span className="frontend-onboarding-emphasis-label">{activeSlide.emphasisLabel}</span>
              <span className="frontend-onboarding-emphasis-value">{activeSlide.emphasisValue}</span>
            </div>
          )}
          {error ? (
            <p className="frontend-onboarding-permission-error">{error}</p>
          ) : null}
          {isLastSlide && !canStartWindieOs ? (
            <p className="frontend-onboarding-permission-error">
              WindieOS is still loading permission status. Wait a moment and try again.
            </p>
          ) : null}
          {isLastSlide && missingRequiredPermissions.length > 0 ? (
            <p className="frontend-onboarding-permission-error">
              Some permissions are still missing. You can continue now and grant them later in Settings.
            </p>
          ) : null}
        </div>
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
              onClick={handleComplete}
              disabled={!canStartWindieOs}
            >
              Start WindieOS
            </button>
          ) : (
            <button
              type="button"
              className="frontend-onboarding-button primary"
              onClick={() => setActiveSlideIndex((current) => Math.min(current + 1, totalSlides - 1))}
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
  onComplete: PropTypes.func,
  stopAgentShortcutLabel: PropTypes.string,
};

export default FrontendOnboardingSlideshow;
