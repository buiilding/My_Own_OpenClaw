import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { parseResponseOverlayPhasePayload } from './responseOverlayPhasePayload';

export function subscribeResponseOverlayPhase(onPhase) {
  const removeListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_PHASE, (payload) => {
    const parsedPayload = parseResponseOverlayPhasePayload(payload);
    if (!parsedPayload) {
      return;
    }
    onPhase(parsedPayload.phase, parsedPayload);
  });

  return () => {
    removeListener?.();
  };
}
