/**
 * Coordinates desktop app config persistence and settings event fan-out.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

export type DesktopSettingsEventPayload = {
  type?: string;
  payload?: Record<string, unknown>;
};

export type DesktopSettingsEventListener = (payload: DesktopSettingsEventPayload) => void;

export const DesktopAppConfigRuntimeClient = {
  loadRendererConfig(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG);
  },

  saveRendererConfig(config: Record<string, unknown>): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG, config);
  },

  onSettingsEvent(listener: DesktopSettingsEventListener): (() => void) | undefined {
    return IpcBridge.on(ON_CHANNELS.BACKEND_SETTINGS_EVENT, listener as (payload: unknown) => void);
  },
};
