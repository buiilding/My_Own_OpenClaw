import { useState, useEffect, useRef, useCallback } from 'react';
import { buildGatewayAudioMessage, float32ToPcm16 } from '../utils/audioEncoding';

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
 * Connects to Nova-Voice Gateway WebSocket, captures audio, and handles transcription.
 * 
 * @param {boolean} enabled - Whether voice mode is enabled
 * @param {Function} onTranscriptionUpdate - Callback when transcription text updates
 * @param {Function} onUtteranceEnd - Callback when utterance ends (silence detected)
 * @param {string} gatewayUrl - Nova-Voice Gateway WebSocket URL (default: ws://localhost:5026)
 * @returns {Object} - Voice mode state and controls
 */
export function useVoiceMode(enabled: boolean, onTranscriptionUpdate?: (text: string, isFinal: boolean) => void, onUtteranceEnd?: () => void, gatewayUrl: string = 'ws://localhost:5026') {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  const websocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isRecordingRef = useRef(false);
  const enabledRef = useRef(enabled);
  const onTranscriptionUpdateRef = useRef(onTranscriptionUpdate);
  const onUtteranceEndRef = useRef(onUtteranceEnd);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    onTranscriptionUpdateRef.current = onTranscriptionUpdate;
  }, [onTranscriptionUpdate]);

  useEffect(() => {
    onUtteranceEndRef.current = onUtteranceEnd;
  }, [onUtteranceEnd]);

  // Connect to Nova-Voice Gateway WebSocket
  const connectWebSocket = useCallback(() => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      const ws = new WebSocket(gatewayUrl);
      websocketRef.current = ws;

      ws.onopen = () => {
        console.log('[VoiceMode] Connected to Nova-Voice Gateway');
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
        setError('WebSocket connection error');
        setIsConnected(false);
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
      setError('Failed to connect to voice gateway');
      setIsConnected(false);
    }
  }, [clearReconnectTimeout, gatewayUrl]);

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

      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
      audioContextRef.current = audioContext;

      // Create source node from media stream
      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      // Create ScriptProcessorNode for raw audio processing
      const bufferSize = 4096;
      const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
      scriptNodeRef.current = scriptNode;

      scriptNode.onaudioprocess = (event) => {
        if (!isRecordingRef.current || !websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        // Get raw audio data from input buffer
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Convert Float32Array to Int16Array
        const int16Data = float32ToPcm16(inputData);
        
        // Format and send to Gateway
        const message = buildGatewayAudioMessage(int16Data, 16000);
        
        try {
          websocketRef.current.send(message);
        } catch (err) {
          console.error('[VoiceMode] Error sending audio:', err);
        }
      };

      // Connect the nodes
      sourceNode.connect(scriptNode);
      scriptNode.connect(audioContext.destination); // Connect to destination to start processing

      isRecordingRef.current = true;
      setIsRecording(true);
      console.log('[VoiceMode] Audio capture started');
    } catch (err: any) {
      console.error('[VoiceMode] Error starting audio capture:', err);
      setError(`Audio capture failed: ${err.message}`);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  }, []);

  // Stop audio capture
  const stopAudioCapture = useCallback(async () => {
    if (!isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = false;
    setIsRecording(false);

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

    console.log('[VoiceMode] Audio capture stopped');
  }, []);

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

  // Enable/disable voice mode
  useEffect(() => {
    if (enabled) {
      connectWebSocket();
    } else {
      stopAudioCapture();
      disconnectWebSocket();
      setError(null);
    }

    return () => {
      if (!enabled) {
        stopAudioCapture();
        disconnectWebSocket();
      }
    };
  }, [enabled, connectWebSocket, stopAudioCapture, disconnectWebSocket]);

  // Start audio capture when connected
  useEffect(() => {
    if (enabled && isConnected && !isRecording) {
      startAudioCapture();
    }
  }, [enabled, isConnected, isRecording, startAudioCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioCapture();
      disconnectWebSocket();
    };
  }, [stopAudioCapture, disconnectWebSocket]);

  return {
    isConnected,
    isRecording,
    error,
    clientId,
  };
}
