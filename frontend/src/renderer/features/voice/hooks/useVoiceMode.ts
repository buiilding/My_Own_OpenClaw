import { useState, useEffect, useRef, useCallback } from 'react';
import { buildGatewayAudioMessage, float32ToPcm16 } from '../utils/audioEncoding';
import {
  cleanupAudioCaptureNodes,
  takeAudioContext,
} from '../utils/audioCaptureCleanup';
import { createAudioCaptureProcessorNode } from '../utils/audioProcessorNode';
import { useAudioCaptureRefs } from './useAudioCaptureRefs';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';
import { buildTranscriptionWebSocketUrl } from '../../../infrastructure/services/BackendEndpointStore';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE_MS = 1000;
const SET_LANGUAGE_PAYLOAD = JSON.stringify({
  type: 'set_langs',
  source_language: 'en',
  target_language: 'en',
});
const START_OVER_PAYLOAD = JSON.stringify({ type: 'start_over' });

function getReconnectDelayMs(attempt: number): number {
  return RECONNECT_DELAY_BASE_MS * Math.pow(2, attempt - 1);
}

/**
 * Custom hook for managing voice mode functionality.
 * Connects to the backend-owned WindieOS transcription WebSocket, captures audio,
 * and handles transcription.
 * 
 * @param {boolean} enabled - Whether voice mode is enabled
 * @param {Function} onTranscriptionUpdate - Callback when transcription text updates
 * @param {Function} onUtteranceEnd - Callback when utterance ends (silence detected)
 * @param {string} gatewayUrl - Backend transcription WebSocket URL
 * @returns {Object} - Voice mode state and controls
 */
export function useVoiceMode(enabled: boolean, onTranscriptionUpdate?: (text: string, isFinal: boolean) => void, onUtteranceEnd?: () => void, gatewayUrl: string = buildTranscriptionWebSocketUrl()) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  const websocketRef = useRef<WebSocket | null>(null);
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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isRecordingRef = useRef(false);
  const enabledRef = useLatestRef(enabled);
  const onTranscriptionUpdateRef = useLatestRef(onTranscriptionUpdate);
  const onUtteranceEndRef = useLatestRef(onUtteranceEnd);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const markConnectionError = useCallback((message: string) => {
    setError(message);
    setIsConnected(false);
  }, []);

  // Connect to the backend-owned transcription WebSocket
  const connectWebSocket = useCallback(() => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      const ws = new WebSocket(gatewayUrl);
      websocketRef.current = ws;

      ws.onopen = () => {
        console.log('[VoiceMode] Connected to backend transcription gateway');
        setIsConnected(true);
        setError(null);
        clearReconnectTimeout();
        reconnectAttemptsRef.current = 0;

        // Send language settings (no translation needed)
        ws.send(SET_LANGUAGE_PAYLOAD);
      };

      ws.onmessage = (event) => {
        try {
          // Handle binary messages (shouldn't receive these, but handle gracefully)
          if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
            console.warn('[VoiceMode] Received unexpected binary message');
            return;
          }

          const data = JSON.parse(event.data as string);

          switch (data.type) {
            case 'status':
              // Connection established, store client_id
              if (data.client_id) {
                setClientId(data.client_id);
                console.log('[VoiceMode] Client ID:', data.client_id);
              }
              break;

            case 'realtime': {
              // Transcription result
              const transcriptionText = data.translation || data.text || '';
              if (transcriptionText && onTranscriptionUpdateRef.current) {
                onTranscriptionUpdateRef.current(transcriptionText, data.is_final === true || data.is_final === 'true');
              }
              break;
            }

            case 'utterance_end':
              // Silence detected, trigger auto-send
              console.log('[VoiceMode] Utterance ended (silence detected)');
              if (onUtteranceEndRef.current) {
                onUtteranceEndRef.current();
              }
              // Send start_over to reset Gateway session
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(START_OVER_PAYLOAD);
              }
              break;

            default:
              console.log('[VoiceMode] Unknown message type:', data.type);
          }
        } catch (err) {
          console.error('[VoiceMode] Error parsing message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[VoiceMode] WebSocket error:', err);
        markConnectionError('WebSocket connection error');
      };

      ws.onclose = () => {
        if (websocketRef.current !== ws) {
          return;
        }

        console.log('[VoiceMode] WebSocket closed');
        setIsConnected(false);

        // Attempt reconnection if enabled and not manually closed
        if (!enabledRef.current) {
          return;
        }

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError('Failed to connect to voice gateway after multiple attempts');
          return;
        }

        const attempt = reconnectAttemptsRef.current + 1;
        const delay = getReconnectDelayMs(attempt);
        reconnectAttemptsRef.current = attempt;
        console.log(`[VoiceMode] Reconnecting in ${delay}ms (attempt ${attempt})`);

        clearReconnectTimeout();
        reconnectTimeoutRef.current = setTimeout(() => {
          if (enabledRef.current) {
            connectWebSocket();
          }
        }, delay) as any;
      };
    } catch (err) {
      console.error('[VoiceMode] Error creating WebSocket:', err);
      markConnectionError('Failed to connect to voice gateway');
    }
  }, [
    clearReconnectTimeout,
    enabledRef,
    gatewayUrl,
    markConnectionError,
    onTranscriptionUpdateRef,
    onUtteranceEndRef,
  ]);

  // Start audio capture
  const startAudioCapture = useCallback(async () => {
    if (isRecordingRef.current) {
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      setMediaStreamRef(stream);

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
      setAudioContextRef(audioContext);

      // Create source node from media stream
      const sourceNode = audioContext.createMediaStreamSource(stream);
      setSourceNodeRef(sourceNode);

      const scriptNode = await createAudioCaptureProcessorNode({
        audioContext,
        sourceNode,
        chunkSize: 4096,
        onChunk: (inputData) => {
          if (!isRecordingRef.current || !websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
            return;
          }

          const int16Data = float32ToPcm16(inputData);
          const message = buildGatewayAudioMessage(int16Data, 16000);

          try {
            websocketRef.current.send(message);
          } catch (err) {
            console.error('[VoiceMode] Error sending audio:', err);
          }
        },
      });
      setScriptNodeRef(scriptNode);

      isRecordingRef.current = true;
      setIsRecording(true);
      console.log('[VoiceMode] Audio capture started');
    } catch (err: any) {
      console.error('[VoiceMode] Error starting audio capture:', err);
      setError(`Audio capture failed: ${err.message}`);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  }, [
    setAudioContextRef,
    setMediaStreamRef,
    setScriptNodeRef,
    setSourceNodeRef,
  ]);

  // Stop audio capture
  const stopAudioCapture = useCallback(async () => {
    if (!isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = false;
    setIsRecording(false);

    cleanupAudioCaptureNodes(scriptNodeRef, sourceNodeRef, mediaStreamRef);

    const audioContext = takeAudioContext(audioContextRef);
    if (audioContext) {
      await audioContext.close();
    }

    console.log('[VoiceMode] Audio capture stopped');
  }, [audioContextRef, mediaStreamRef, scriptNodeRef, sourceNodeRef]);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    clearReconnectTimeout();

    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    setIsConnected(false);
    setClientId(null);
  }, [clearReconnectTimeout]);

  const shutdownVoiceMode = useCallback(() => {
    void stopAudioCapture();
    disconnectWebSocket();
  }, [disconnectWebSocket, stopAudioCapture]);

  // Enable/disable voice mode
  useEffect(() => {
    if (enabled) {
      connectWebSocket();
    } else {
      shutdownVoiceMode();
      setError(null);
    }

    return () => {
      if (!enabled) {
        shutdownVoiceMode();
      }
    };
  }, [enabled, connectWebSocket, shutdownVoiceMode]);

  // Start audio capture when connected
  useEffect(() => {
    if (enabled && isConnected && !isRecording) {
      startAudioCapture();
    }
  }, [enabled, isConnected, isRecording, startAudioCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shutdownVoiceMode();
    };
  }, [shutdownVoiceMode]);

  return {
    isConnected,
    isRecording,
    error,
    clientId,
  };
}
