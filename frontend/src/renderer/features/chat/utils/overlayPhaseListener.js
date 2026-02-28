import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';

export function subscribeResponseOverlayPhase(onPhase) {
  const removeListener = IpcBridge.on(ON_CHANNELS.RESPONSE_OVERLAY_PHASE, (payload) => {
    const phase = typeof payload?.phase === 'string' ? payload.phase : null;
    if (!phase) {
      return;
    }
    onPhase(phase, {
      phase,
      source: typeof payload?.source === 'string' ? payload.source : undefined,
      correlation_id: typeof payload?.correlation_id === 'string' ? payload.correlation_id : undefined,
      attempt: typeof payload?.attempt === 'number' ? payload.attempt : undefined,
      max_attempts: typeof payload?.max_attempts === 'number' ? payload.max_attempts : undefined,
      recovery_stage: typeof payload?.recovery_stage === 'string' ? payload.recovery_stage : undefined,
      failure_reason: typeof payload?.failure_reason === 'string' ? payload.failure_reason : undefined,
    });
  });

  return () => {
    removeListener?.();
  };
}
