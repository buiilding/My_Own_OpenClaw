import { useState, useEffect, useRef, useCallback } from 'react';
import { IpcBridge, SEND_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { float32ToPcm16, normalizeScriptProcessorChunkSize } from '../utils/audioEncoding';
import {
  cleanupAudioCaptureNodes,
  closeAudioContextSafely,
  takeAudioContext,
} from '../utils/audioCaptureCleanup';
import { createAudioCaptureProcessorNode } from '../utils/audioProcessorNode';
import {
  getChunkSizeWarning,
  isWithinCooldown,
  resolveConfidence,
} from '../utils/wakewordEventUtils';
import {
  clearWakewordCaptureGuard,
  getWakewordCaptureGuard,
  hasAvailableAudioInputDevice,
  isMissingAudioDeviceError,
} from '../utils/wakewordCaptureGuard';
import { useAudioCaptureRefs } from './useAudioCaptureRefs';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';

const WAKEWORD_COOLDOWN_MS = 2000;
const CAPTURE_RETRY_DELAY_MS = 3000;
const MISSING_DEVICE_RETRY_DELAY_MS = 60000;
const wakewordCaptureGuard = getWakewordCaptureGuard();

/**
 * Custom hook for wakeword detection using openWakeWord.
 * 
 * Captures audio from microphone and sends to Electron main process
 * which forwards to Python wakeword service.
 * 
 * @param {boolean} enabled - Whether wakeword detection is enabled
 * @param {Function} onWakewordDetected - Callback when wakeword is detected
 * @param {Object} options - Configuration options
 * @returns {Object} - Wakeword detection state and controls
 */
export function useWakewordDetection(
  enabled: boolean,
  onWakewordDetected?: (data: { model: string; confidence: number; score?: number }) => void,
  options: {
    sampleRate?: number;
    chunkSize?: number;
    threshold?: number;
    wakewordPreferenceEnabled?: boolean;
  } = {}
) {
  const {
    sampleRate = 16000,
    chunkSize: rawChunkSize = 1024,
    threshold = 0.5,
    wakewordPreferenceEnabled = enabled,
  } = options;

  // Ensure chunkSize is a valid power of 2
  const chunkSize = normalizeScriptProcessorChunkSize(rawChunkSize);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    mediaStreamRef,
    audioContextRef,
    sourceNodeRef,
    scriptNodeRef,
    setMediaStreamRef,
    setAudioContextRef,
    setSourceNodeRef,
    setScriptNodeRef,
  } = useAudioCaptureRefs();
  const isCapturingRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const isStartingCaptureRef = useRef(false);
  const localCaptureErrorRef = useRef(false);
  const missingDeviceLockRef = useRef(wakewordCaptureGuard.missingDeviceLocked);
  const nextCaptureRetryAtRef = useRef(wakewordCaptureGuard.nextRetryAt);
  const lastDetectionRef = useRef(0);
  const onWakewordDetectedRef = useLatestRef(onWakewordDetected);

  const clearMissingDeviceLock = useCallback(() => {
    missingDeviceLockRef.current = false;
    nextCaptureRetryAtRef.current = 0;
    clearWakewordCaptureGuard(wakewordCaptureGuard);
  }, []);

  const refreshMissingDeviceLock = useCallback(async () => {
    if (!missingDeviceLockRef.current) {
      return true;
    }
    const hasAudioInput = await hasAvailableAudioInputDevice();
    if (!hasAudioInput) {
      nextCaptureRetryAtRef.current = Date.now() + MISSING_DEVICE_RETRY_DELAY_MS;
      wakewordCaptureGuard.nextRetryAt = nextCaptureRetryAtRef.current;
      return false;
    }
    clearMissingDeviceLock();
    return true;
  }, [clearMissingDeviceLock]);

  useEffect(() => {
    const warningMessage = getChunkSizeWarning(rawChunkSize, chunkSize);
    if (warningMessage) {
      console.warn(warningMessage);
    }
  }, [rawChunkSize, chunkSize]);

  // Send audio chunk to main process via IPC
  const sendAudioChunk = useCallback((audioData: Int16Array) => {
    if (!isCapturingRef.current) {
      return;
    }

    // Convert Int16Array to ArrayBuffer for transmission
    const buffer = audioData.buffer;
    IpcBridge.send(SEND_CHANNELS.WAKEWORD_AUDIO_CHUNK, buffer);
  }, []);

  const requestWakewordEnable = useCallback(() => {
    IpcBridge.send(SEND_CHANNELS.WAKEWORD_ENABLE, {});
  }, []);

  const requestWakewordDisable = useCallback(() => {
    IpcBridge.send(SEND_CHANNELS.WAKEWORD_DISABLE, {});
  }, []);

  const logUnexpectedAudioContextCloseError = useCallback((err: unknown) => {
    console.warn('[Wakeword] Failed to close AudioContext:', err);
  }, []);

  // Start audio capture
  const startAudioCapture = useCallback(async () => {
    if (isCapturingRef.current || isStartingCaptureRef.current) {
      return;
    }
    if (Date.now() < nextCaptureRetryAtRef.current) {
      return;
    }
    const shouldStartCapture = await refreshMissingDeviceLock();
    if (!shouldStartCapture) {
      return;
    }
    isStartingCaptureRef.current = true;
    const generation = ++captureGenerationRef.current;
    console.log('[Wakeword] Starting audio capture...');

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      if (generation !== captureGenerationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      setMediaStreamRef(stream);

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: sampleRate
      });

      if (generation !== captureGenerationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        await closeAudioContextSafely(audioContext, logUnexpectedAudioContextCloseError);
        return;
      }

      setAudioContextRef(audioContext);

      // Create source node from media stream
      const sourceNode = audioContext.createMediaStreamSource(stream);
      setSourceNodeRef(sourceNode);

      const scriptNode = await createAudioCaptureProcessorNode({
        audioContext,
        sourceNode,
        chunkSize,
        onChunk: (inputData) => {
          if (!isCapturingRef.current) {
            return;
          }
          const int16Data = float32ToPcm16(inputData);
          sendAudioChunk(int16Data);
        },
      });

      if (generation !== captureGenerationRef.current) {
        scriptNode.disconnect();
        if (scriptNode.port) {
          scriptNode.port.onmessage = null;
        }
        if (scriptNode.onaudioprocess) {
          scriptNode.onaudioprocess = null;
        }
        stream.getTracks().forEach(track => track.stop());
        await closeAudioContextSafely(audioContext, logUnexpectedAudioContextCloseError);
        return;
      }

      setScriptNodeRef(scriptNode);

      isCapturingRef.current = true;
      localCaptureErrorRef.current = false;
      nextCaptureRetryAtRef.current = 0;
      setError(null);
    } catch (err: any) {
      if (generation !== captureGenerationRef.current) {
        return;
      }
      const missingDevice = isMissingAudioDeviceError(err);
      const errorMessage = missingDevice
        ? 'Microphone device unavailable: requested input device was not found. Re-enable wakeword after reconnecting a microphone.'
        : `Audio capture failed: ${err.message}`;
      console.error('[Wakeword] Error starting audio capture:', err);
      setError(errorMessage);
      localCaptureErrorRef.current = true;
      if (missingDevice) {
        missingDeviceLockRef.current = true;
        wakewordCaptureGuard.missingDeviceLocked = true;
        nextCaptureRetryAtRef.current = Date.now() + MISSING_DEVICE_RETRY_DELAY_MS;
      } else {
        nextCaptureRetryAtRef.current = Date.now() + CAPTURE_RETRY_DELAY_MS;
      }
      wakewordCaptureGuard.nextRetryAt = nextCaptureRetryAtRef.current;
      isCapturingRef.current = false;
    } finally {
      if (generation === captureGenerationRef.current) {
        isStartingCaptureRef.current = false;
      }
    }
  }, [
    chunkSize,
    logUnexpectedAudioContextCloseError,
    refreshMissingDeviceLock,
    sampleRate,
    setAudioContextRef,
    setMediaStreamRef,
    setScriptNodeRef,
    setSourceNodeRef,
    sendAudioChunk,
  ]);

  // Stop audio capture
  const stopAudioCapture = useCallback(async () => {
    captureGenerationRef.current += 1;
    isStartingCaptureRef.current = false;
    const hadResources = Boolean(
      isCapturingRef.current
      || scriptNodeRef.current
      || sourceNodeRef.current
      || mediaStreamRef.current
      || audioContextRef.current
    );

    isCapturingRef.current = false;

    cleanupAudioCaptureNodes(scriptNodeRef, sourceNodeRef, mediaStreamRef);

    const audioContext = takeAudioContext(audioContextRef);
    await closeAudioContextSafely(audioContext, logUnexpectedAudioContextCloseError);

    if (hadResources) {
      console.log('[Wakeword] Audio capture stopped');
    }
  }, [
    audioContextRef,
    logUnexpectedAudioContextCloseError,
    mediaStreamRef,
    scriptNodeRef,
    sourceNodeRef,
  ]);

  // Handle wakeword detection/status from main process
  useEffect(() => {
    const unsubscribe = IpcBridge.on(ON_CHANNELS.WAKEWORD_DETECTED, (data: any) => {
      const now = Date.now();
      const confidence = resolveConfidence(data?.confidence);
      if (confidence === null) {
        console.warn('[Wakeword] Invalid confidence value in detection event');
        return;
      }
      const confidenceText = confidence.toFixed(4);
      
      // Cooldown check to prevent multiple rapid detections
      if (isWithinCooldown(now, lastDetectionRef.current, WAKEWORD_COOLDOWN_MS)) {
        return;
      }

      console.log(`[Wakeword] Detection event: model=${data.model}, confidence=${confidenceText}, threshold=${threshold}`);
      
      if (confidence >= threshold) {
        lastDetectionRef.current = now;
        console.log(`[Wakeword] *** DETECTED *** ${data.model} (confidence: ${confidenceText})`);
        
        // Immediately disable wakeword processing to prevent buffered chunks from triggering again
        requestWakewordDisable();
        
        if (onWakewordDetectedRef.current) {
          onWakewordDetectedRef.current({
            model: data.model,
            confidence,
            score: data.score,
          });
        } else {
          console.warn('[Wakeword] No callback provided');
        }
      } else {
        console.log(`[Wakeword] Below threshold (${confidenceText} < ${threshold})`);
      }
    });

    // Listen for wakeword service status - only log when state actually changes
    const statusUnsubscribe = IpcBridge.on(ON_CHANNELS.WAKEWORD_STATUS, (status: any) => {
      setIsReady(prevReady => {
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
      } else {
        if (!localCaptureErrorRef.current) {
          setError(null);
        }
      }
    });

    return () => {
      unsubscribe?.();
      statusUnsubscribe?.();
    };
  }, [enabled, onWakewordDetectedRef, requestWakewordDisable, threshold]);

  // Start/stop audio capture based on enabled state
  useEffect(() => {
    if (enabled) {
      // Ensure main process service is started when wakeword is enabled.
      requestWakewordEnable();
      if (isReady && !isCapturingRef.current) {
        lastDetectionRef.current = Date.now();
        void startAudioCapture();
      }
    } else {
      localCaptureErrorRef.current = false;
      setError(null);
      const hasCaptureResources = Boolean(
        isCapturingRef.current
        || scriptNodeRef.current
        || sourceNodeRef.current
        || mediaStreamRef.current
        || audioContextRef.current
      );

      if (isCapturingRef.current || isReady || hasCaptureResources) {
        if (isCapturingRef.current || hasCaptureResources) {
          console.log('[Wakeword] Disabled, stopping audio capture');
        }
        lastDetectionRef.current = Date.now();
        requestWakewordDisable();
        void stopAudioCapture();
      }
    }

    return () => {
      void stopAudioCapture();
    };
  }, [
    audioContextRef,
    enabled,
    isReady,
    mediaStreamRef,
    requestWakewordDisable,
    requestWakewordEnable,
    scriptNodeRef,
    sourceNodeRef,
    startAudioCapture,
    stopAudioCapture,
  ]);

  useEffect(() => {
    if (wakewordPreferenceEnabled) {
      return;
    }
    localCaptureErrorRef.current = false;
    clearMissingDeviceLock();
    setError(null);
  }, [clearMissingDeviceLock, wakewordPreferenceEnabled]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.addEventListener !== 'function') {
      return undefined;
    }

    const handleDeviceChange = () => {
      if (!missingDeviceLockRef.current) {
        return;
      }
      void refreshMissingDeviceLock().then((isUnlocked) => {
        if (isUnlocked && enabled && isReady && !isCapturingRef.current) {
          void startAudioCapture();
        }
      });
    };

    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enabled, isReady, refreshMissingDeviceLock, startAudioCapture]);

  return {
    isReady,
    error,
    isCapturing: isCapturingRef.current,
  };
}
