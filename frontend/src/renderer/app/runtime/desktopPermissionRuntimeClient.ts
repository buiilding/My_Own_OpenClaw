/**
 * Coordinates desktop permission runtime commands for renderer permission UI.
 */

import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { INVOKE_CHANNELS } from '../../infrastructure/ipc/channels';

export type PermissionStatusValue = {
  permission_id: string;
  status: string;
  granted: boolean;
  reason: string;
  checked_at: string | null;
  details: Record<string, unknown>;
};

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getErrorMessage(result: unknown, fallbackMessage: string): string {
  if (
    result
    && typeof result === 'object'
    && 'error' in result
    && typeof result.error === 'string'
    && result.error.trim()
  ) {
    return result.error.trim();
  }

  return fallbackMessage;
}

function getResultData(result: unknown, fallbackMessage: string): Record<string, unknown> {
  if (
    result
    && typeof result === 'object'
    && 'success' in result
    && result.success === true
    && 'data' in result
    && result.data
    && typeof result.data === 'object'
  ) {
    return result.data as Record<string, unknown>;
  }

  throw new Error(getErrorMessage(result, fallbackMessage));
}

function normalizePermissionStatusValue(status: unknown): PermissionStatusValue | null {
  const source = recordOrEmpty(status);
  const permissionId = typeof source.permission_id === 'string' ? source.permission_id : '';
  if (!permissionId) {
    return null;
  }

  return {
    permission_id: permissionId,
    status: typeof source.status === 'string' ? source.status : 'unknown',
    granted: source.granted === true,
    reason: typeof source.reason === 'string' ? source.reason : '',
    checked_at: typeof source.checked_at === 'string' ? source.checked_at : null,
    details: recordOrEmpty(source.details),
  };
}

function mapPermissionStatusesByPermissionId(
  statuses: unknown,
): Record<string, PermissionStatusValue> {
  if (!Array.isArray(statuses)) {
    return {};
  }

  return statuses.reduce<Record<string, PermissionStatusValue>>((accumulator, status) => {
    const normalizedStatus = normalizePermissionStatusValue(status);
    if (normalizedStatus) {
      accumulator[normalizedStatus.permission_id] = normalizedStatus;
    }
    return accumulator;
  }, {});
}

function resolvePermissionManifestResult(result: unknown): unknown {
  return getResultData(result, 'Failed to load permission manifest.');
}

function resolvePermissionStatusResult(
  result: unknown,
  fallbackMessage = 'Failed to update permission status.',
): unknown {
  const data = getResultData(result, fallbackMessage);
  if ('status' in data && data.status) {
    const status = normalizePermissionStatusValue(data.status);
    if (status) {
      return status;
    }
  }

  throw new Error(getErrorMessage(result, fallbackMessage));
}

function resolvePermissionStatusesResult(result: unknown): unknown[] {
  const data = getResultData(result, 'Failed to recheck permissions.');
  if ('statuses' in data && Array.isArray(data.statuses)) {
    return Object.values(mapPermissionStatusesByPermissionId(data.statuses));
  }

  throw new Error(getErrorMessage(result, 'Failed to recheck permissions.'));
}

export const DesktopPermissionRuntimeClient = {
  listPermissions(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.LIST_PERMISSIONS);
  },

  async listPermissionManifest(): Promise<unknown> {
    return resolvePermissionManifestResult(await this.listPermissions());
  },

  runPermissionProbe(permissionId: string): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.RUN_PERMISSION_PROBE, { permissionId });
  },

  async runPermissionProbeStatus(permissionId: string): Promise<unknown> {
    return resolvePermissionStatusResult(
      await this.runPermissionProbe(permissionId),
      'Failed to run permission probe.',
    );
  },

  requestPermission(permissionId: string): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.REQUEST_PERMISSION, { permissionId });
  },

  async requestPermissionStatus(permissionId: string): Promise<unknown> {
    return resolvePermissionStatusResult(
      await this.requestPermission(permissionId),
      'Failed to request permission.',
    );
  },

  checkPermissions(permissionIds: string[]): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.CHECK_PERMISSIONS, { permissionIds });
  },

  async checkPermissionStatuses(permissionIds: string[]): Promise<unknown[]> {
    return resolvePermissionStatusesResult(await this.checkPermissions(permissionIds));
  },

  mapPermissionStatusesByPermissionId(
    statuses: unknown,
  ): Record<string, PermissionStatusValue> {
    return mapPermissionStatusesByPermissionId(statuses);
  },
};
