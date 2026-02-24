import { useState, useEffect, useRef, useCallback } from 'react';
import { IpcBridge, SEND_CHANNELS, ON_CHANNELS } from '../../../infrastructure/ipc/bridge';
import { float32ToPcm16, normalizeScriptProcessorChunkSize } from '../utils/audioEncoding';
import {
  cleanupAudioCaptureNodes,
  closeAudioContextSafely,
  type LegacyAudioProcessorNode,
  takeAudioContext,
} from '../utils/audioCaptureCleanup';
import {
  getChunkSizeWarning,
  isWithinCooldown,
  resolveConfidence,
} from '../utils/wakewordEventUtils';
import { useAudioCaptureRefs } from './useAudioCaptureRefs';

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
  options: { sampleRate?: number; chunkSize?: number; threshold?: number } = {}
) {
  const {
    sampleRate = 16000,
    chunkSize: rawChunkSize = 1024,
    threshold = 0.5,
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
  const lastDetectionRef = useRef(0);
  const cooldownPeriod = 2000; // 2 seconds cooldown between detections
  
  // Use ref to store callback so effect doesn't re-run when callback changes
  const onWakewordDetectedRef = useRef(onWakewordDetected);
  onWakewordDetectedRef.current = onWakewordDetected;

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

  const logUnexpectedAudioContextCloseError = useCallback((err: unknown) => {
    console.warn('[Wakeword] Failed to close AudioContext:', err);
  }, []);

  // Start audio capture
  const startAudioCapture = useCallback(async () => {
    if (isCapturingRef.current) {
      return;
    }
    const generation = ++captureGenerationRef.current;

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

      // Create ScriptProcessorNode for audio processing
      const bufferSize = chunkSize;
      const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1) as unknown as LegacyAudioProcessorNode;
      setScriptNodeRef(scriptNode);

      scriptNode.onaudioprocess = (event) => {
        if (!isCapturingRef.current) {
          return;
        }

        // Get audio data from input buffer
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Convert Float32Array to Int16Array
        const int16Data = float32ToPcm16(inputData);
        
        // Send to main process
        sendAudioChunk(int16Data);
      };

      // Connect the nodes
      sourceNode.connect(scriptNode);
      scriptNode.connect(audioContext.destination);

      isCapturingRef.current = true;
    } catch (err: any) {
      if (generation !== captureGenerationRef.current) {
        return;
      }
      console.error('[Wakeword] Error starting audio capture:', err);
      setError(`Audio capture failed: ${err.message}`);
      isCapturingRef.current = false;
    }
  }, [
    chunkSize,
    logUnexpectedAudioContextCloseError,
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

  // Handle wakeword detection from main process
  useEffect(() => {
    const unsubscribe = IpcBridge.on(ON_CHANNELS.WAKEWORD_DETECTED, (data: any) => {
      const now = Date.now();
      const confidence = resolveConfidence(data?.confidence);
      if (confidence === null) {
        console.warn('[Wakeword] Invalid confidence value in detection event');
        return;
      }
      
      // Cooldown check to prevent multiple rapid detections
      if (isWithinCooldown(now, lastDetectionRef.current, cooldownPeriod)) {
        return;
      }

      console.log(`[Wakeword] Detection event: model=${data.model}, confidence=${confidence.toFixed(4)}, threshold=${threshold}`);
      
      if (confidence >= threshold) {
        lastDetectionRef.current = now;
        console.log(`[Wakeword] *** DETECTED *** ${data.model} (confidence: ${confidence.toFixed(4)})`);
        
        // Immediately disable wakeword processing to prevent buffered chunks from triggering again
        IpcBridge.send(SEND_CHANNELS.WAKEWORD_DISABLE);
        
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
        console.log(`[Wakeword] Below threshold (${confidence.toFixed(4)} < ${threshold})`);
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
        console.error('[Wakeword] Service error:', status.error);
        setError(status.error);
      } else {
        setError(null);
      }
    });

    // Enable wakeword detection in main process (this will trigger status response)
    IpcBridge.send(SEND_CHANNELS.WAKEWORD_ENABLE);

    return () => {
      unsubscribe?.();
      statusUnsubscribe?.();
    };
  }, [threshold]);

  // Start/stop audio capture based on enabled state
  useEffect(() => {
    if (enabled && isReady) {
      // Only start if not already capturing
      if (!isCapturingRef.current) {
        console.log('[Wakeword] Starting audio capture...');
        // Reset cooldown when re-enabling to prevent old buffered chunks from triggering
        lastDetectionRef.current = Date.now();
        // Send enable signal to main process to clear buffers
        IpcBridge.send(SEND_CHANNELS.WAKEWORD_ENABLE);
        void startAudioCapture();
      }
    } else {
      // Only stop if currently capturing or if disabled
      if (isCapturingRef.current || !enabled) {
        if (!enabled) {
          console.log('[Wakeword] Disabled, stopping audio capture');
          // Reset cooldown when disabled to prevent immediate re-triggering when re-enabled
          lastDetectionRef.current = Date.now();
          // Send disable signal to main process to clear buffers
          IpcBridge.send(SEND_CHANNELS.WAKEWORD_DISABLE);
        } else if (!isReady) {
          console.log('[Wakeword] Service not ready, stopping audio capture');
        }
        void stopAudioCapture();
      }
    }

    return () => {
      void stopAudioCapture();
    };
  }, [enabled, isReady, startAudioCapture, stopAudioCapture]);

  return {
    isReady,
    error,
    isCapturing: isCapturingRef.current,
  };
}
