import { useEffect, useMemo, useState } from 'react';
import { usePermissionStore } from '../stores/permissionStore';

const TOOL_GROUP_LABELS = {
  computer_control: 'mouse and keyboard control',
  screenshot: 'screen capture',
  voice: 'voice input',
  filesystem: 'file read/replace tools',
  system: 'system commands',
  browser: 'browser automation',
  planned_system_access: 'planned system-access scope',
};

function featureLossCopy(permission) {
  const featureLabels = Array.isArray(permission?.unlocks_tool_groups)
    ? permission.unlocks_tool_groups
      .map((group) => TOOL_GROUP_LABELS[group])
      .filter(Boolean)
    : [];

  if (!featureLabels.length) {
    return null;
  }

  if (featureLabels.length === 1) {
    return `Denying this disables ${featureLabels[0]}.`;
  }
  if (featureLabels.length === 2) {
    return `Denying this disables ${featureLabels[0]} and ${featureLabels[1]}.`;
  }
  return `Denying this disables ${featureLabels.slice(0, -1).join(', ')}, and ${featureLabels.slice(-1)[0]}.`;
}

function buildWarningCopy(permission) {
  const featureText = featureLossCopy(permission);
  if (!featureText) {
    return 'Denying this blocks required functionality.';
  }
  return featureText;
}

function PermissionOnboardingWizard() {
  const permissions = usePermissionStore((state) => state.permissions);
  const statusesByPermissionId = usePermissionStore((state) => state.statusesByPermissionId);
  const missingRequiredPermissions = usePermissionStore((state) => state.missingRequiredPermissions);
  const error = usePermissionStore((state) => state.error);
  const requestPermission = usePermissionStore((state) => state.requestPermission);
  const setPlannedSystemAccessConsent = usePermissionStore((state) => state.setPlannedSystemAccessConsent);
  const completeOnboarding = usePermissionStore((state) => state.completeOnboarding);

  const [currentPermissionIndex, setCurrentPermissionIndex] = useState(0);
  const [slidePhase, setSlidePhase] = useState('static');
  const [denyWarning, setDenyWarning] = useState('');

  const requiredPermissions = useMemo(
    () => permissions.filter((permission) => permission.required_now === true),
    [permissions],
  );

  const hasPermissionSlides = requiredPermissions.length > 0;
  const completedAllRequired = currentPermissionIndex >= requiredPermissions.length;
  const currentPermission = hasPermissionSlides && !completedAllRequired
    ? requiredPermissions[currentPermissionIndex]
    : null;
  const currentStatus = currentPermission
    ? statusesByPermissionId[currentPermission.permission_id]
    : null;
  const currentGranted = currentStatus?.granted === true;
  const canInteract = slidePhase === 'static' && !completedAllRequired;

  const requiredGranted = missingRequiredPermissions.length === 0;

  const slideClassName = `permission-slide permission-slide-${slidePhase}`;

  useEffect(() => {
    if (!hasPermissionSlides) {
      setCurrentPermissionIndex(0);
      setSlidePhase('static');
      return;
    }

    if (!currentPermission || completedAllRequired || slidePhase !== 'static') {
      return;
    }

    if (!currentGranted) {
      return;
    }

    if (currentPermissionIndex >= requiredPermissions.length - 1) {
      setCurrentPermissionIndex(requiredPermissions.length);
      return;
    }

    setSlidePhase('exit');
  }, [
    hasPermissionSlides,
    currentPermission,
    currentPermissionIndex,
    completedAllRequired,
    currentGranted,
    requiredPermissions.length,
    slidePhase,
  ]);

  useEffect(() => {
    if (slidePhase === 'exit') {
      const timeoutId = setTimeout(() => {
        setCurrentPermissionIndex((index) => Math.min(index + 1, requiredPermissions.length));
        setSlidePhase('enter');
        setDenyWarning('');
      }, 240);
      return () => clearTimeout(timeoutId);
    }

    if (slidePhase === 'enter') {
      const timeoutId = setTimeout(() => {
        setSlidePhase('static');
      }, 240);
      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [slidePhase, requiredPermissions.length]);

  const onDeny = () => {
    if (!currentPermission) {
      return;
    }
    setDenyWarning(buildWarningCopy(currentPermission));
  };

  const onAllow = async () => {
    if (!currentPermission || !canInteract) {
      return;
    }

    setDenyWarning('');
    await requestPermission(currentPermission.permission_id);
  };

  return (
    <div className="permission-onboarding-shell">
      <header className="permission-onboarding-header">
        <div>
          <h1>WindieOS is requesting your permissions</h1>
        </div>
      </header>

      <section className="permission-onboarding-card">
        <div className="permission-slide-track">
          <div className={slideClassName} aria-live="polite">
            {hasPermissionSlides === false ? (
              <p className="permission-onboarding-permission-state">
                No install-time required permissions are defined.
              </p>
            ) : completedAllRequired ? (
              <p className="permission-onboarding-permission-state">
                All required permissions are now enabled.
              </p>
            ) : (
              <>
                <h3>{currentPermission.label}</h3>
                <p className="permission-onboarding-permission-reason">
                  {currentPermission.description}
                </p>

                <div className="permission-onboarding-slide-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={onDeny}
                    disabled={!canInteract}
                  >
                    Deny
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      void onAllow();
                    }}
                    disabled={!canInteract}
                  >
                    Allow
                  </button>
                </div>

              </>
            )}

            {denyWarning ? (
              <p className="permission-onboarding-permission-warning">
                {denyWarning}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <footer className="permission-onboarding-footer">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setPlannedSystemAccessConsent(true);
            completeOnboarding();
          }}
          disabled={!requiredGranted}
        >
          Continue to WindieOS
        </button>
        {requiredGranted && completedAllRequired ? (
          <p className="permission-onboarding-status">
            All required permissions are enabled.
          </p>
        ) : null}
      </footer>

      {error ? <p className="permission-error">{error}</p> : null}
    </div>
  );
}

export default PermissionOnboardingWizard;
