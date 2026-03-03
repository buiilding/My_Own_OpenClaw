import {
  readJsonObjectFromLocalStorage,
  writeJsonObjectToLocalStorage,
} from '../../../infrastructure/storage/jsonLocalStorage';

const PERMISSION_ONBOARDING_STORAGE_KEY = 'windieos-permission-onboarding';

function readFromStorage() {
  return readJsonObjectFromLocalStorage(PERMISSION_ONBOARDING_STORAGE_KEY);
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
  writeJsonObjectToLocalStorage(PERMISSION_ONBOARDING_STORAGE_KEY, state);
}
