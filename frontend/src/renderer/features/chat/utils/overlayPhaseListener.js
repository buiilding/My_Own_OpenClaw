import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';

export function subscribeResponseOverlayPhase(onPhase) {
  const removeListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_PHASE, (payload) => {
    const phase = typeof payload?.phase === 'string' ? payload.phase : null;
    if (!phase) {
      return;
    }
    onPhase(phase);
  });

  return () => {
    removeListener?.();
  };
}
