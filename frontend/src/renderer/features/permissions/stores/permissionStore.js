import { create } from 'zustand';
import { IpcBridge, INVOKE_CHANNELS } from '../../../infrastructure/ipc/bridge';
import {
  loadPermissionOnboardingState,
  savePermissionOnboardingState,
} from '../utils/permissionStorage';

function mapStatusesByPermissionId(statuses) {
  if (!Array.isArray(statuses)) {
    return {};
  }

  return statuses.reduce((accumulator, status) => {
    const permissionId = typeof status?.permission_id === 'string' ? status.permission_id : '';
    if (!permissionId) {
      return accumulator;
    }

    accumulator[permissionId] = {
      permission_id: permissionId,
      status: typeof status?.status === 'string' ? status.status : 'unknown',
      granted: status?.granted === true,
      reason: typeof status?.reason === 'string' ? status.reason : '',
      checked_at: typeof status?.checked_at === 'string' ? status.checked_at : null,
      details: status?.details && typeof status.details === 'object' ? status.details : {},
    };

    return accumulator;
  }, {});
}

function resolveGateState({
  permissions,
  statusesByPermissionId,
  onboardingState,
  manifestVersion,
}) {
  const requiredPermissionIds = permissions
    .filter((permission) => permission.required_now === true)
    .map((permission) => permission.permission_id);

  const missingRequiredPermissions = requiredPermissionIds.filter((permissionId) => (
    statusesByPermissionId[permissionId]?.granted !== true
  ));

  const manifestMatches = onboardingState.manifest_version === manifestVersion;
  const completedForManifest = manifestMatches && onboardingState.completed === true;

  const needsOnboarding = !completedForManifest
    || missingRequiredPermissions.length > 0;

  return {
    requiredPermissionIds,
    missingRequiredPermissions,
    needsOnboarding,
    completedForManifest,
  };
}

async function invokePermissionChannel(channel, payload = {}) {
  return IpcBridge.invoke(channel, payload);
}

function buildStatusStateUpdate(currentState, statusPayload, options = {}) {
  const incomingStatuses = mapStatusesByPermissionId(statusPayload);
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
      const result = await invokePermissionChannel(INVOKE_CHANNELS.LIST_PERMISSIONS);
      if (!result?.success || !result?.data) {
        throw new Error(result?.error || 'Failed to load permission manifest.');
      }

      const manifestVersion = typeof result.data.manifest_version === 'string'
        ? result.data.manifest_version
        : '';
      const permissions = Array.isArray(result.data.permissions) ? result.data.permissions : [];
      const statusesByPermissionId = mapStatusesByPermissionId(result.data.statuses);
      const onboardingState = loadPermissionOnboardingState();
      const gateState = resolveGateState({
        permissions,
        statusesByPermissionId,
        onboardingState,
        manifestVersion,
      });

      set({
        manifestVersion,
        generatedAt: typeof result.data.generated_at === 'string' ? result.data.generated_at : null,
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
      return;
    }

    try {
      const result = await invokePermissionChannel(INVOKE_CHANNELS.RUN_PERMISSION_PROBE, {
        permissionId,
      });

      if (!result?.success || !result?.data?.status) {
        throw new Error(result?.error || 'Failed to run permission probe.');
      }

      set(buildStatusStateUpdate(get(), [result.data.status]));
    } catch (error) {
      set({ error: error?.message || 'Failed to run permission probe.' });
    }
  },

  requestPermission: async (permissionId) => {
    if (!permissionId) {
      return null;
    }

    try {
      const result = await invokePermissionChannel(INVOKE_CHANNELS.REQUEST_PERMISSION, {
        permissionId,
      });

      if (!result?.success || !result?.data?.status) {
        throw new Error(result?.error || 'Failed to request permission.');
      }

      set(buildStatusStateUpdate(get(), [result.data.status]));
      return result.data.status;
    } catch (error) {
      set({ error: error?.message || 'Failed to request permission.' });
      return null;
    }
  },

  recheckAllPermissions: async () => {
    try {
      const permissionIds = get().permissions.map((permission) => permission.permission_id);
      const result = await invokePermissionChannel(INVOKE_CHANNELS.CHECK_PERMISSIONS, {
        permissionIds,
      });
      if (!result?.success || !result?.data?.statuses) {
        throw new Error(result?.error || 'Failed to recheck permissions.');
      }

      set(buildStatusStateUpdate(get(), result.data.statuses, { replace: true }));
    } catch (error) {
      set({ error: error?.message || 'Failed to recheck permissions.' });
    }
  },

  completeOnboarding: () => {
    const {
      missingRequiredPermissions,
      manifestVersion,
      onboardingState,
      permissions,
      statusesByPermissionId,
    } = get();

    if (!manifestVersion) {
      set({ error: 'Missing permission manifest version.' });
      return false;
    }

    if (missingRequiredPermissions.length > 0) {
      set({ error: 'Grant all required permissions before continuing.' });
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
}));
