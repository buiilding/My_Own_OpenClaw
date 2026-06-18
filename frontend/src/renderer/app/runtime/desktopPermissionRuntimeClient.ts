/**
 * Coordinates desktop permission runtime commands for renderer permission UI.
 */

import { IpcBridge, INVOKE_CHANNELS } from '../../infrastructure/ipc/bridge';

export const DesktopPermissionRuntimeClient = {
  listPermissions(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.LIST_PERMISSIONS);
  },

  runPermissionProbe(permissionId: string): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.RUN_PERMISSION_PROBE, { permissionId });
  },

  requestPermission(permissionId: string): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.REQUEST_PERMISSION, { permissionId });
  },

  checkPermissions(permissionIds: string[]): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.CHECK_PERMISSIONS, { permissionIds });
  },
};
