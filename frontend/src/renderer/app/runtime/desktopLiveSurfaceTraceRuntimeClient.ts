/**
 * Coordinates desktop live-surface trace forwarding for renderer diagnostics.
 */

import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { SEND_CHANNELS } from '../../infrastructure/ipc/channels';

export type DesktopLiveSurfaceTracePayload = Record<string, unknown>;

export const DesktopLiveSurfaceTraceRuntimeClient = {
  send(payload: DesktopLiveSurfaceTracePayload): void {
    IpcBridge.send(SEND_CHANNELS.LIVE_SURFACE_TRACE, payload);
  },
};
