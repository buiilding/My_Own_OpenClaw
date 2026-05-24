import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from '../../infrastructure/api/windieSdkClient';
import { createDesktopBackendTransport } from './desktopBackendTransport';

type RuntimeSettingsPatch = Record<string, unknown>;

/**
 * Renderer settings/model command facade for the SDK runtime hosted by Electron main.
 *
 * App-level providers and model settings UI should use this module instead of
 * reaching for low-level backend IPC methods directly.
 */
export const DesktopSettingsRuntimeClient = {
  listModels(): void {
    void createDesktopBackendTransport(null).listModels();
  },

  updateSettings(config: RuntimeSettingsPatch): void {
    void createDesktopBackendTransport(null).updateSettings(config);
  },

  setModel(selection: WindieModelSelection): void {
    void createDesktopBackendTransport(null).updateSettings(
      buildModelSettingsPatch(selection, 'DesktopSettingsRuntimeClient.setModel'),
    );
  },
};
