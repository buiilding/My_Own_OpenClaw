const FRONTEND_ONBOARDING_STORAGE_KEY = 'windieos-frontend-onboarding';

function readFrontendOnboardingState() {
  try {
    const raw = window.localStorage.getItem(FRONTEND_ONBOARDING_STORAGE_KEY);
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

export function loadFrontendOnboardingState() {
  const parsed = readFrontendOnboardingState();
  if (!parsed) {
    return {
      completed: false,
      completed_at: null,
    };
  }

  return {
    completed: parsed.completed === true,
    completed_at: typeof parsed.completed_at === 'string' ? parsed.completed_at : null,
  };
}

export function saveFrontendOnboardingState(state) {
  try {
    window.localStorage.setItem(
      FRONTEND_ONBOARDING_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // best-effort persistence; onboarding still works in-memory
  }
}

