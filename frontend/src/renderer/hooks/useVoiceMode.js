import { useState, useEffect, useRef, useCallback } from 'react';

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
export function useVoiceMode(enabled, onTranscriptionUpdate, onUtteranceEnd, gatewayUrl = 'ws://localhost:5026') {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [clientId, setClientId] = useState(null);

  const websocketRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const scriptNodeRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const isRecordingRef = useRef(false);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_BASE = 1000; // Start with 1 second

  // Convert Float32Array to Int16Array for transmission
  const float32ToInt16 = useCallback((float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }, []);

  // Format audio chunk for Nova-Voice Gateway
  const formatAudioMessage = useCallback((audioData) => {
    const metadata = { sampleRate: 16000 };
    const metadataJson = JSON.stringify(metadata);
    const metadataLength = new Uint32Array([metadataJson.length]);
    const metadataBytes = new TextEncoder().encode(metadataJson);
    
    const message = new Uint8Array([
      ...new Uint8Array(metadataLength.buffer),
      ...metadataBytes,
      ...new Uint8Array(audioData.buffer)
    ]);
    
    return message;
  }, []);

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
        reconnectAttemptsRef.current = 0;

        // Send language settings (no translation needed)
        ws.send(JSON.stringify({
          type: 'set_langs',
          source_language: 'en',
          target_language: 'en'
        }));
      };

      ws.onmessage = (event) => {
        try {
          // Handle binary messages (shouldn't receive these, but handle gracefully)
          if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
            console.warn('[VoiceMode] Received unexpected binary message');
            return;
          }

          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'status':
              // Connection established, store client_id
              if (data.client_id) {
                setClientId(data.client_id);
                console.log('[VoiceMode] Client ID:', data.client_id);
              }
              break;

            case 'realtime':
              // Transcription result
              const transcriptionText = data.translation || data.text || '';
              if (transcriptionText && onTranscriptionUpdate) {
                onTranscriptionUpdate(transcriptionText, data.is_final === true || data.is_final === 'true');
              }
              break;

            case 'utterance_end':
              // Silence detected, trigger auto-send
              console.log('[VoiceMode] Utterance ended (silence detected)');
              if (onUtteranceEnd) {
                onUtteranceEnd();
              }
              // Send start_over to reset Gateway session
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'start_over' }));
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
        console.log('[VoiceMode] WebSocket closed');
        setIsConnected(false);
        
        // Attempt reconnection if enabled and not manually closed
        if (enabled && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          console.log(`[VoiceMode] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError('Failed to connect to voice gateway after multiple attempts');
        }
      };
    } catch (err) {
      console.error('[VoiceMode] Error creating WebSocket:', err);
      setError('Failed to connect to voice gateway');
      setIsConnected(false);
    }
  }, [gatewayUrl, enabled, onTranscriptionUpdate, onUtteranceEnd]);

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
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
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
        const int16Data = float32ToInt16(inputData);
        
        // Format and send to Gateway
        const message = formatAudioMessage(int16Data);
        
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
    } catch (err) {
      console.error('[VoiceMode] Error starting audio capture:', err);
      setError(`Audio capture failed: ${err.message}`);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  }, [float32ToInt16, formatAudioMessage]);

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
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    setIsConnected(false);
    setClientId(null);
  }, []);

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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [stopAudioCapture, disconnectWebSocket]);

  return {
    isConnected,
    isRecording,
    error,
    clientId,
  };
}

