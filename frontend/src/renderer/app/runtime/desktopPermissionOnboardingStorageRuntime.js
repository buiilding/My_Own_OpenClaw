/**
 * Persists renderer permission onboarding gate state for the app runtime.
 */

import {
  readJsonObjectFromLocalStorage,
  writeJsonObjectToLocalStorage,
} from '../../infrastructure/storage/jsonLocalStorage';
import { DesktopRuntimeConfig } from '../skin/desktopRuntimeConfig';

const {
  RENDERER_STORAGE_KEYS,
} = DesktopRuntimeConfig;

const PERMISSION_ONBOARDING_STORAGE_KEY = RENDERER_STORAGE_KEYS.permissionOnboarding;

function getPermissionOnboardingStorageKey() {
  return PERMISSION_ONBOARDING_STORAGE_KEY;
}

function readFromStorage() {
  return readJsonObjectFromLocalStorage(PERMISSION_ONBOARDING_STORAGE_KEY);
}

function loadPermissionOnboardingState() {
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

function savePermissionOnboardingState(state) {
  writeJsonObjectToLocalStorage(PERMISSION_ONBOARDING_STORAGE_KEY, state);
}

export const DesktopPermissionOnboardingStorageRuntime = Object.freeze({
  getPermissionOnboardingStorageKey,
  loadPermissionOnboardingState,
  savePermissionOnboardingState,
});
