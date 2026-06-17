/**
 * Provides the permission storage module for the renderer UI.
 */

import {
  readJsonObjectFromLocalStorage,
  writeJsonObjectToLocalStorage,
} from '../../../infrastructure/storage/jsonLocalStorage';

const PERMISSION_ONBOARDING_STORAGE_KEY = 'desktop-agent-permission-onboarding';

function readFromStorage() {
  return readJsonObjectFromLocalStorage(PERMISSION_ONBOARDING_STORAGE_KEY);
}

export function loadPermissionOnboardingState() {
  const parsed = readFromStorage();
  if (!parsed) {
    return {
      manifest_version: '',
      completed: false,
      completed_at: null,
    };
  }

  return {
    manifest_version: typeof parsed.manifest_version === 'string' ? parsed.manifest_version : '',
    completed: parsed.completed === true,
    completed_at: typeof parsed.completed_at === 'string' ? parsed.completed_at : null,
  };
}

export function savePermissionOnboardingState(state) {
  writeJsonObjectToLocalStorage(PERMISSION_ONBOARDING_STORAGE_KEY, state);
}
