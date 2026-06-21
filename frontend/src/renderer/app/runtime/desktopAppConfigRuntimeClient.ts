/**
 * Coordinates desktop app config persistence and settings event fan-out.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../infrastructure/ipc/bridge';
import { isSettingsUpdateErrorText } from './desktopSettingsUpdateErrorRuntime';

export type DesktopSettingsEventPayload = {
  type?: string;
  payload?: Record<string, unknown>;
  isSettingsUpdateError: boolean;
};

export type DesktopSettingsEventListener = (payload: DesktopSettingsEventPayload) => void;
export type DesktopSettingsSaveStatusAction = 'success' | 'error';
export type DesktopSettingsSaveStatusListener = (status: DesktopSettingsSaveStatusAction) => void;

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeDesktopSettingsEvent(payload: unknown): DesktopSettingsEventPayload {
  const source = recordOrEmpty(payload);
  const eventPayload = recordOrEmpty(source.payload);
  const message = typeof eventPayload.message === 'string' ? eventPayload.message : '';
  return {
    type: typeof source.type === 'string' ? source.type : undefined,
    payload: eventPayload,
    isSettingsUpdateError: source.type === 'error'
      && isSettingsUpdateErrorText(message),
  };
}

function resolveDesktopSettingsSaveStatusAction(
  payload: unknown,
): DesktopSettingsSaveStatusAction | null {
  const event = normalizeDesktopSettingsEvent(payload);
  if (event.type === 'settings-updated') {
    return 'success';
  }
  if (event.isSettingsUpdateError) {
    return 'error';
  }
  return null;
}

export const DesktopAppConfigRuntimeClient = {
  loadRendererConfig(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.LOAD_FRONTEND_CONFIG);
  },

  saveRendererConfig(config: Record<string, unknown>): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SAVE_FRONTEND_CONFIG, config);
  },

  onSettingsEvent(listener: DesktopSettingsEventListener): (() => void) | undefined {
    return IpcBridge.on(
      ON_CHANNELS.BACKEND_SETTINGS_EVENT,
      (payload: unknown) => listener(normalizeDesktopSettingsEvent(payload)),
    );
  },

  onSettingsSaveStatusAction(
    listener: DesktopSettingsSaveStatusListener,
  ): (() => void) | undefined {
    return IpcBridge.on(
      ON_CHANNELS.BACKEND_SETTINGS_EVENT,
      (payload: unknown) => {
        const status = resolveDesktopSettingsSaveStatusAction(payload);
        if (status) {
          listener(status);
        }
      },
    );
  },
};
