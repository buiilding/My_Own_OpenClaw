import {
  readJsonObjectFromLocalStorage,
  writeJsonObjectToLocalStorage,
} from '../../../infrastructure/storage/jsonLocalStorage';

const FRONTEND_ONBOARDING_STORAGE_KEY = 'windieos-frontend-onboarding';

function readFrontendOnboardingState() {
  return readJsonObjectFromLocalStorage(FRONTEND_ONBOARDING_STORAGE_KEY);
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
  writeJsonObjectToLocalStorage(FRONTEND_ONBOARDING_STORAGE_KEY, state);
}
