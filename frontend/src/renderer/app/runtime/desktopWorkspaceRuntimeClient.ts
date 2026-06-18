/**
 * Coordinates desktop workspace event subscriptions for renderer clients.
 */

import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

export type DesktopWorkspaceAccessUpdatedPayload = {
  granted?: boolean;
  source?: string;
  workspaceName?: string;
  workspacePath?: string;
};

export type DesktopWorkspaceAccessUpdatedListener = (
  payload: DesktopWorkspaceAccessUpdatedPayload | null | undefined,
) => void;

export const DesktopWorkspaceRuntimeClient = {
  onWorkspaceAccessUpdated(listener: DesktopWorkspaceAccessUpdatedListener): (() => void) | undefined {
    if (!ON_CHANNELS?.WORKSPACE_ACCESS_UPDATED) {
      return undefined;
    }
    return IpcBridge.on(ON_CHANNELS.WORKSPACE_ACCESS_UPDATED, listener);
  },
};
