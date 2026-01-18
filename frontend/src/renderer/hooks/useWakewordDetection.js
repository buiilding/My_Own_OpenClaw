import { useState, useEffect, useRef, useCallback } from 'react';

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
export function useWakewordDetection(enabled, onWakewordDetected, options = {}) {
  // Validate and fix chunkSize - must be power of 2 for ScriptProcessor
  const getValidChunkSize = (size) => {
    const validSizes = [256, 512, 1024, 1280, 2048, 4096, 8192, 16384];
    // Find closest valid size
    return validSizes.reduce((prev, curr) =>
      Math.abs(curr - size) < Math.abs(prev - size) ? curr : prev
    );
  };

  const {
    sampleRate = 16000,
    chunkSize: rawChunkSize = 1024,
    threshold = 0.5,
  } = options;

  // Ensure chunkSize is a valid power of 2
  const chunkSize = getValidChunkSize(rawChunkSize);
  if (rawChunkSize !== chunkSize) {
    console.warn(`[Wakeword] chunkSize ${rawChunkSize} is not a power of 2, using ${chunkSize} instead`);
  }

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const scriptNodeRef = useRef(null);
  const isCapturingRef = useRef(false);
  const lastDetectionRef = useRef(0);
  const cooldownPeriod = 2000; // 2 seconds cooldown between detections
  
  // Use ref to store callback so effect doesn't re-run when callback changes
  const onWakewordDetectedRef = useRef(onWakewordDetected);
  useEffect(() => {
    onWakewordDetectedRef.current = onWakewordDetected;
  }, [onWakewordDetected]);

  // Convert Float32Array to Int16Array (16-bit PCM)
  const float32ToInt16 = useCallback((float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }, []);

  let sentChunkCountRef = useRef(0);
  // Send audio chunk to main process via IPC
  const sendAudioChunk = useCallback((audioData) => {
    if (!window.ipc) {
      if (sentChunkCountRef.current === 0) {
        console.error('[Wakeword] IPC not available');
      }
      return;
    }
    
    if (!isCapturingRef.current) {
      return;
    }
    
    sentChunkCountRef.current++;
    
    // Convert Int16Array to ArrayBuffer for transmission
    const buffer = audioData.buffer;
    window.ipc.send('wakeword-audio-chunk', buffer);
  }, []);

  // Start audio capture
  const startAudioCapture = useCallback(async () => {
    if (isCapturingRef.current) {
      return;
    }

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

      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: sampleRate
      });
      audioContextRef.current = audioContext;

      // Create source node from media stream
      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      // Create ScriptProcessorNode for audio processing
      const bufferSize = chunkSize;
      const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
      scriptNodeRef.current = scriptNode;

      let processedChunkCount = 0;
      scriptNode.onaudioprocess = (event) => {
        if (!isCapturingRef.current) {
          return;
        }

        // Get audio data from input buffer
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Convert Float32Array to Int16Array
        const int16Data = float32ToInt16(inputData);
        
        processedChunkCount++;
        
        // Send to main process
        sendAudioChunk(int16Data);
      };

      // Connect the nodes
      sourceNode.connect(scriptNode);
      scriptNode.connect(audioContext.destination);

      isCapturingRef.current = true;
    } catch (err) {
      console.error('[Wakeword] Error starting audio capture:', err);
      setError(`Audio capture failed: ${err.message}`);
      isCapturingRef.current = false;
    }
  }, [sampleRate, chunkSize, float32ToInt16, sendAudioChunk]);

  // Stop audio capture
  const stopAudioCapture = useCallback(async () => {
    if (!isCapturingRef.current) {
      return;
    }

    isCapturingRef.current = false;

    // Disconnect and cleanup audio nodes
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current.onaudioprocess = null;
      scriptNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    console.log('[Wakeword] Audio capture stopped');
  }, []);

  // Handle wakeword detection from main process
  useEffect(() => {
    if (!window.ipc) {
      setError('IPC not available');
      return;
    }

    const unsubscribe = window.ipc.on('wakeword-detected', (data) => {
      const now = Date.now();
      
      // Cooldown check to prevent multiple rapid detections
      if (now - lastDetectionRef.current < cooldownPeriod) {
        return;
      }

      console.log(`[Wakeword] Detection event: model=${data.model}, confidence=${data.confidence.toFixed(4)}, threshold=${threshold}`);
      
      if (data.confidence >= threshold) {
        const timeSinceLastDetection = now - lastDetectionRef.current;
        if (timeSinceLastDetection < cooldownPeriod) {
          console.log(`[Wakeword] Ignoring (cooldown: ${timeSinceLastDetection}ms < ${cooldownPeriod}ms)`);
          return;
        }
        
        lastDetectionRef.current = now;
        console.log(`[Wakeword] *** DETECTED *** ${data.model} (confidence: ${data.confidence.toFixed(4)})`);
        
        // Immediately disable wakeword processing to prevent buffered chunks from triggering again
        // The parent component will handle enabling voice mode, which will disable wakeword
        // But we also send disable signal here to clear buffers immediately
        if (window.ipc) {
          window.ipc.send('wakeword-disable');
        }
        
        if (onWakewordDetectedRef.current) {
          onWakewordDetectedRef.current({
            model: data.model,
            confidence: data.confidence,
            score: data.score,
          });
        } else {
          console.warn('[Wakeword] No callback provided');
        }
      } else {
        console.log(`[Wakeword] Below threshold (${data.confidence.toFixed(4)} < ${threshold})`);
      }
    });

    // Listen for wakeword service status - only log when state actually changes
    const statusUnsubscribe = window.ipc.on('wakeword-status', (status) => {
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
    // Only send once on mount, not on every re-render
    window.ipc.send('wakeword-enable');

    return () => {
      unsubscribe?.();
      statusUnsubscribe?.();
    };
  }, [threshold]); // Removed onWakewordDetected from dependencies - using ref instead

  // Start/stop audio capture based on enabled state
  useEffect(() => {
    if (enabled && isReady) {
      // Only start if not already capturing
      if (!isCapturingRef.current) {
        console.log('[Wakeword] Starting audio capture...');
        // Reset cooldown when re-enabling to prevent old buffered chunks from triggering
        lastDetectionRef.current = Date.now();
        // Send enable signal to main process to clear buffers
        if (window.ipc) {
          window.ipc.send('wakeword-enable');
        }
        startAudioCapture();
      }
    } else {
      // Only stop if currently capturing or if disabled
      if (isCapturingRef.current || !enabled) {
        if (!enabled) {
          console.log('[Wakeword] Disabled, stopping audio capture');
          // Reset cooldown when disabled to prevent immediate re-triggering when re-enabled
          lastDetectionRef.current = Date.now();
          // Send disable signal to main process to clear buffers
          if (window.ipc) {
            window.ipc.send('wakeword-disable');
          }
        } else if (!isReady) {
          console.log('[Wakeword] Service not ready, stopping audio capture');
        }
        stopAudioCapture();
      }
    }

    return () => {
      stopAudioCapture();
    };
  }, [enabled, isReady, startAudioCapture, stopAudioCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioCapture();
    };
  }, [stopAudioCapture]);

  return {
    isReady,
    error,
    isCapturing: isCapturingRef.current,
  };
}


