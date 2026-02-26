const PERMISSION_ONBOARDING_STORAGE_KEY = 'windieos-permission-onboarding';

function readFromStorage() {
  try {
    const raw = window.localStorage.getItem(PERMISSION_ONBOARDING_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadPermissionOnboardingState() {
  const parsed = readFromStorage();
  if (!parsed) {
    return {
      manifest_version: '',
      completed: false,
      planned_system_access_consent: false,
      completed_at: null,
    };
  }

  return {
    manifest_version: typeof parsed.manifest_version === 'string' ? parsed.manifest_version : '',
    completed: parsed.completed === true,
    planned_system_access_consent: parsed.planned_system_access_consent === true,
    completed_at: typeof parsed.completed_at === 'string' ? parsed.completed_at : null,
  };
}

export function savePermissionOnboardingState(state) {
  try {
    window.localStorage.setItem(
      PERMISSION_ONBOARDING_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // best-effort persistence; onboarding still works in-memory
  }
}
