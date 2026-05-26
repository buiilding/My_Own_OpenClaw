import { createDesktopBackendTransport } from './desktopBackendTransport';

/**
 * Renderer voice command facade for the SDK runtime hosted by Electron main.
 */
export const DesktopVoiceRuntimeClient = {
  wakewordDetected(): Promise<string | void> {
    return createDesktopBackendTransport(null).wakewordDetected({});
  },
};
