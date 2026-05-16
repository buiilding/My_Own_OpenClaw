import { ApiClient } from '../../infrastructure/api/client';

/**
 * Renderer voice command facade for the SDK runtime hosted by Electron main.
 */
export const DesktopVoiceRuntimeClient = {
  wakewordDetected(): void {
    ApiClient.wakewordDetected();
  },
};
