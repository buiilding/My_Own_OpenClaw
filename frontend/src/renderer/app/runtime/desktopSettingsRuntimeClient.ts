import { ApiClient } from '../../infrastructure/api/client';

type RuntimeSettingsPatch = Record<string, unknown>;

/**
 * Renderer settings/model command facade for the SDK runtime hosted by Electron main.
 *
 * App-level providers and model settings UI should use this module instead of
 * reaching for low-level backend IPC methods directly.
 */
export const DesktopSettingsRuntimeClient = {
  listModels(): void {
    ApiClient.listModels();
  },

  updateSettings(config: RuntimeSettingsPatch): void {
    ApiClient.updateSettings(config);
  },
};
