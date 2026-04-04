import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { IpcBridge, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { isWithinCooldown, resolveConfidence } from '../utils/wakewordEventUtils';

type WakewordDetectionPayload = {
  model: string;
  confidence: number;
  score?: number;
};

type UseWakewordBridgeEventsOptions = {
  enabled: boolean;
  threshold: number;
  cooldownMs: number;
  lastDetectionRef: MutableRefObject<number>;
  localCaptureErrorRef: MutableRefObject<boolean>;
  onWakewordDetectedRef: MutableRefObject<((data: WakewordDetectionPayload) => void) | undefined>;
  requestWakewordDisable: () => void;
  setIsReady: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useWakewordBridgeEvents({
  enabled,
  threshold,
  cooldownMs,
  lastDetectionRef,
  localCaptureErrorRef,
  onWakewordDetectedRef,
  requestWakewordDisable,
  setIsReady,
  setError,
}: UseWakewordBridgeEventsOptions) {
  useEffect(() => {
    const unsubscribe = IpcBridge.on(ON_CHANNELS.WAKEWORD_DETECTED, (data: any) => {
      const now = Date.now();
      const confidence = resolveConfidence(data?.confidence);
      if (confidence === null) {
        console.warn('[Wakeword] Invalid confidence value in detection event');
        return;
      }

      const confidenceText = confidence.toFixed(4);
      if (isWithinCooldown(now, lastDetectionRef.current, cooldownMs)) {
        return;
      }

      console.log(`[Wakeword] Detection event: model=${data.model}, confidence=${confidenceText}, threshold=${threshold}`);

      if (confidence < threshold) {
        console.log(`[Wakeword] Below threshold (${confidenceText} < ${threshold})`);
        return;
      }

      lastDetectionRef.current = now;
      console.log(`[Wakeword] *** DETECTED *** ${data.model} (confidence: ${confidenceText})`);
      requestWakewordDisable();

      if (!onWakewordDetectedRef.current) {
        console.warn('[Wakeword] No callback provided');
        return;
      }

      onWakewordDetectedRef.current({
        model: data.model,
        confidence,
        score: data.score,
      });
    });

    const statusUnsubscribe = IpcBridge.on(ON_CHANNELS.WAKEWORD_STATUS, (status: any) => {
      setIsReady((prevReady) => {
        if (prevReady !== status.ready) {
          console.log(`[Wakeword] Service status: ready=${status.ready}, error=${status.error || 'none'}`);
        }
        return status.ready;
      });

      if (status.error) {
        if (enabled) {
          console.error('[Wakeword] Service error:', status.error);
          setError(status.error);
        } else {
          setError(null);
        }
        return;
      }

      if (!localCaptureErrorRef.current) {
        setError(null);
      }
    });

    return () => {
      unsubscribe?.();
      statusUnsubscribe?.();
    };
  }, [
    cooldownMs,
    enabled,
    lastDetectionRef,
    localCaptureErrorRef,
    onWakewordDetectedRef,
    requestWakewordDisable,
    setError,
    setIsReady,
    threshold,
  ]);
}
