/**
 * Bridges use wakeword events behavior for the renderer UI.
 */

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { DesktopVoiceRuntimeClient } from '../../../app/runtime/desktopVoiceRuntimeClient';
import { isWithinCooldown, resolveConfidence } from '../utils/wakewordEventUtils';
import { logVoiceDebugTrace } from '../utils/voiceDebugTrace';

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
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const unsubscribe = DesktopVoiceRuntimeClient.onWakewordDetected((data: any) => {
      if (!enabledRef.current) {
        return;
      }

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

      logVoiceDebugTrace('wakeword-detection-event', {
        model: data.model,
        confidence: confidenceText,
        threshold,
      });

      if (confidence < threshold) {
        logVoiceDebugTrace('wakeword-detection-below-threshold', {
          confidence: confidenceText,
          threshold,
        });
        return;
      }

      lastDetectionRef.current = now;
      logVoiceDebugTrace('wakeword-detected', {
        model: data.model,
        confidence: confidenceText,
      });
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

    const statusUnsubscribe = DesktopVoiceRuntimeClient.onWakewordStatus((status: any) => {
      setIsReady((prevReady) => {
        if (prevReady !== status.ready) {
          logVoiceDebugTrace('wakeword-service-status', {
            ready: status.ready,
            error: status.error || null,
          });
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
