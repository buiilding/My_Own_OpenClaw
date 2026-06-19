/**
 * Persists renderer permission onboarding gate state for the desktop runtime.
 */

import {
  readJsonObjectFromLocalStorage,
  writeJsonObjectToLocalStorage,
} from './desktopStorageRuntimeClient';
import { RENDERER_STORAGE_KEYS } from '../skin/desktopRuntimeConfig';

const PERMISSION_ONBOARDING_STORAGE_KEY = RENDERER_STORAGE_KEYS.permissionOnboarding;

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
