/**
 * Coordinates desktop permission runtime commands for renderer permission UI.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';

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

export function resolvePermissionManifestResult(result: unknown): unknown {
  return getResultData(result, 'Failed to load permission manifest.');
}

export function resolvePermissionStatusResult(
  result: unknown,
  fallbackMessage = 'Failed to update permission status.',
): unknown {
  const data = getResultData(result, fallbackMessage);
  if ('status' in data && data.status) {
    return data.status;
  }

  throw new Error(getErrorMessage(result, fallbackMessage));
}

export function resolvePermissionStatusesResult(result: unknown): unknown[] {
  const data = getResultData(result, 'Failed to recheck permissions.');
  if ('statuses' in data && Array.isArray(data.statuses)) {
    return data.statuses;
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
};
