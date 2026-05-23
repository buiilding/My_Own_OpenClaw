import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';
import type { JsonRecord } from '../../infrastructure/api/windieSdkClient';

export const DesktopLocalRuntimeEventSource = {
  subscribeEvents(listener: (event: JsonRecord & { type?: unknown }) => void): () => void {
    return IpcBridge.on(ON_CHANNELS.SIDECAR_EVENT, (event) => {
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        return;
      }
      listener(event as JsonRecord & { type?: unknown });
    });
  },
};
