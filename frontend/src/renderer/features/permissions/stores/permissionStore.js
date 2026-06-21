/**
 * Stores and retrieves permission state for the renderer UI.
 */

import { create } from 'zustand';
import { DesktopPermissionRuntimeClient } from '../../../app/runtime/desktopPermissionRuntimeClient';
import {
  loadPermissionOnboardingState,
  savePermissionOnboardingState,
} from '../../../app/runtime/desktopPermissionOnboardingStorageRuntime';

function resolveGateState({
  permissions,
  statusesByPermissionId,
  onboardingState,
  manifestVersion,
}) {
  const requiredPermissionIds = permissions
    .filter((permission) => (
      permission.onboarding_required_now === true
        || (permission.onboarding_required_now == null && permission.required_now === true)
    ))
    .map((permission) => permission.permission_id);

  const missingRequiredPermissions = requiredPermissionIds.filter((permissionId) => (
    statusesByPermissionId[permissionId]?.granted !== true
  ));

  const manifestMatches = onboardingState.manifest_version === manifestVersion;
  const completedForManifest = manifestMatches && onboardingState.completed === true;

  const needsOnboarding = !completedForManifest;

  return {
    requiredPermissionIds,
    missingRequiredPermissions,
    needsOnboarding,
    completedForManifest,
  };
}

function buildStatusStateUpdate(currentState, statusPayload, options = {}) {
  const incomingStatuses = DesktopPermissionRuntimeClient.mapPermissionStatusesByPermissionId(
    statusPayload,
  );
  const statusesByPermissionId = options.replace === true
    ? incomingStatuses
    : {
      ...currentState.statusesByPermissionId,
      ...incomingStatuses,
    };
  const gateState = resolveGateState({
    permissions: currentState.permissions,
    statusesByPermissionId,
    onboardingState: currentState.onboardingState,
    manifestVersion: currentState.manifestVersion,
  });

  return {
    statusesByPermissionId,
    ...gateState,
    error: '',
  };
}

export const usePermissionStore = create((set, get) => ({
  manifestVersion: '',
  generatedAt: null,
  permissions: [],
  statusesByPermissionId: {},
  requiredPermissionIds: [],
  missingRequiredPermissions: [],
  needsOnboarding: true,
  completedForManifest: false,
  isLoading: false,
  bootstrapped: false,
  error: '',
  onboardingState: loadPermissionOnboardingState(),

  bootstrapPermissions: async () => {
    if (get().isLoading) {
      return;
    }

    set({ isLoading: true, error: '' });

    try {
      const manifest = await DesktopPermissionRuntimeClient.listPermissionManifest();
      const manifestVersion = typeof manifest.manifest_version === 'string'
        ? manifest.manifest_version
        : '';
      const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
      const statusesByPermissionId = DesktopPermissionRuntimeClient.mapPermissionStatusesByPermissionId(
        manifest.statuses,
      );
      const onboardingState = loadPermissionOnboardingState();
      const gateState = resolveGateState({
        permissions,
        statusesByPermissionId,
        onboardingState,
        manifestVersion,
      });

      set({
        manifestVersion,
        generatedAt: typeof manifest.generated_at === 'string' ? manifest.generated_at : null,
        permissions,
        statusesByPermissionId,
        onboardingState,
        ...gateState,
        isLoading: false,
        bootstrapped: true,
        error: '',
      });
    } catch (error) {
      set({
        isLoading: false,
        bootstrapped: true,
        error: error?.message || 'Failed to load permissions.',
      });
    }
  },

  runPermissionProbe: async (permissionId) => {
    if (!permissionId) {
      return null;
    }

    try {
      const status = await DesktopPermissionRuntimeClient.runPermissionProbeStatus(permissionId);
      set(buildStatusStateUpdate(get(), [status]));
      return status;
    } catch (error) {
      set({ error: error?.message || 'Failed to run permission probe.' });
      return null;
    }
  },

  requestPermission: async (permissionId) => {
    if (!permissionId) {
      return null;
    }

    try {
      const status = await DesktopPermissionRuntimeClient.requestPermissionStatus(permissionId);
      set(buildStatusStateUpdate(get(), [status]));
      return status;
    } catch (error) {
      set({ error: error?.message || 'Failed to request permission.' });
      return null;
    }
  },

  recheckAllPermissions: async () => {
    try {
      const permissionIds = get().permissions.map((permission) => permission.permission_id);
      const statuses = await DesktopPermissionRuntimeClient.checkPermissionStatuses(permissionIds);
      set(buildStatusStateUpdate(get(), statuses, { replace: true }));
    } catch (error) {
      set({ error: error?.message || 'Failed to recheck permissions.' });
    }
  },

  completeOnboarding: () => {
    const {
      manifestVersion,
      permissions,
      statusesByPermissionId,
    } = get();

    if (!manifestVersion) {
      set({ error: 'Missing permission manifest version.' });
      return false;
    }

    const nextOnboardingState = {
      manifest_version: manifestVersion,
      completed: true,
      completed_at: new Date().toISOString(),
    };
    savePermissionOnboardingState(nextOnboardingState);

    const gateState = resolveGateState({
      permissions,
      statusesByPermissionId,
      onboardingState: nextOnboardingState,
      manifestVersion,
    });

    set({
      onboardingState: nextOnboardingState,
      ...gateState,
      error: '',
    });

    return true;
  },

  restartOnboarding: () => {
    const {
      manifestVersion,
      permissions,
      statusesByPermissionId,
    } = get();

    const nextOnboardingState = {
      manifest_version: manifestVersion || '',
      completed: false,
      completed_at: null,
    };
    savePermissionOnboardingState(nextOnboardingState);

    const gateState = resolveGateState({
      permissions,
      statusesByPermissionId,
      onboardingState: nextOnboardingState,
      manifestVersion,
    });

    set({
      onboardingState: nextOnboardingState,
      ...gateState,
      error: '',
    });
  },
}));
