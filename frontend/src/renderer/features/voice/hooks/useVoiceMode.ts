import { useState, useEffect, useRef, useCallback } from 'react';
import { buildGatewayAudioMessage, float32ToPcm16 } from '../utils/audioEncoding';
import {
  closeAudioContextSafely,
  cleanupAudioCaptureNodes,
  takeAudioContext,
} from '../utils/audioCaptureCleanup';
import { createAudioCaptureProcessorNode } from '../utils/audioProcessorNode';
import { useAudioCaptureRefs } from './useAudioCaptureRefs';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';
import { DesktopVoiceRuntimeClient } from '../../../app/runtime/desktopVoiceRuntimeClient';
import { logVoiceDebugTrace } from '../utils/voiceDebugTrace';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE_MS = 1000;

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
export function useVoiceMode(
  enabled: boolean,
  onTranscriptionUpdate?: (text: string, isFinal: boolean) => void,
  onUtteranceEnd?: () => void,
  gatewayUrl: string = DesktopVoiceRuntimeClient.getTranscriptionGatewayUrl(),
) {
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
  const isStartingCaptureRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const enabledRef = useLatestRef(enabled);
  const onTranscriptionUpdateRef = useLatestRef(onTranscriptionUpdate);
  const onUtteranceEndRef = useLatestRef(onUtteranceEnd);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const logUnexpectedAudioContextCloseError = useCallback((err: unknown) => {
    console.warn('[VoiceMode] Failed to close AudioContext:', err);
  }, []);

  const markConnectionError = useCallback((message: string) => {
    setError(message);
    setIsConnected(false);
  }, []);

  // Connect to the backend-owned transcription WebSocket
  const connectWebSocket = useCallback(() => {
    if (
      websocketRef.current
      && websocketRef.current.readyState !== WebSocket.CLOSED
    ) {
      return; // Already connecting or connected
    }

    try {
      const ws = DesktopVoiceRuntimeClient.createTranscriptionWebSocket(gatewayUrl);
      websocketRef.current = ws;

      ws.onopen = () => {
        logVoiceDebugTrace('voice-gateway-connected', {});
        setIsConnected(true);
        setError(null);
        clearReconnectTimeout();
        reconnectAttemptsRef.current = 0;

        DesktopVoiceRuntimeClient.sendDefaultTranscriptionLanguage(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = DesktopVoiceRuntimeClient.normalizeTranscriptionGatewayMessage(event.data);
          if (!data) {
            console.warn('[VoiceMode] Received unexpected binary message');
            return;
          }

          switch (data.type) {
            case 'status':
              if (data.clientId) {
                setClientId(data.clientId);
                logVoiceDebugTrace('voice-gateway-client-id', {
                  clientId: data.clientId,
                });
              }
              break;

            case 'realtime': {
              if (data.text && onTranscriptionUpdateRef.current) {
                onTranscriptionUpdateRef.current(data.text, data.isFinal);
              }
              break;
            }

            case 'utterance_end':
              // Silence detected, trigger auto-send
              logVoiceDebugTrace('voice-utterance-ended', {});
              if (onUtteranceEndRef.current) {
                onUtteranceEndRef.current();
              }
              // Send start_over to reset Gateway session
              if (ws.readyState === WebSocket.OPEN) {
                DesktopVoiceRuntimeClient.sendTranscriptionStartOver(ws);
              }
              break;

            case 'trace_event':
              logVoiceDebugTrace('voice-transcription-trace', {
                path: data.path,
                stage: data.stage,
                status: data.status,
                runtime: data.runtime,
              });
              break;

            default:
              logVoiceDebugTrace('voice-gateway-unknown-message', {
                messageType: data.messageType,
              });
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

        logVoiceDebugTrace('voice-gateway-closed', {});
        websocketRef.current = null;
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
        logVoiceDebugTrace('voice-gateway-reconnect-scheduled', {
          delay,
          attempt,
        });

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
    if (isRecordingRef.current || isStartingCaptureRef.current) {
      return;
    }

    isStartingCaptureRef.current = true;
    const generation = ++captureGenerationRef.current;

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

      if (generation !== captureGenerationRef.current || !enabledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setMediaStreamRef(stream);

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });

      if (generation !== captureGenerationRef.current || !enabledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
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

      if (generation !== captureGenerationRef.current || !enabledRef.current) {
        scriptNode.disconnect();
        if (scriptNode.port) {
          scriptNode.port.onmessage = null;
        }
        if (scriptNode.onaudioprocess) {
          scriptNode.onaudioprocess = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        await closeAudioContextSafely(audioContext, logUnexpectedAudioContextCloseError);
        return;
      }

      setScriptNodeRef(scriptNode);

      isRecordingRef.current = true;
      setIsRecording(true);
      logVoiceDebugTrace('voice-capture-started', {});
    } catch (err: any) {
      if (generation !== captureGenerationRef.current) {
        return;
      }
      console.error('[VoiceMode] Error starting audio capture:', err);
      setError(`Audio capture failed: ${err.message}`);
      setIsRecording(false);
      isRecordingRef.current = false;
    } finally {
      if (generation === captureGenerationRef.current) {
        isStartingCaptureRef.current = false;
      }
    }
  }, [
    enabledRef,
    logUnexpectedAudioContextCloseError,
    setAudioContextRef,
    setMediaStreamRef,
    setScriptNodeRef,
    setSourceNodeRef,
  ]);

  // Stop audio capture
  const stopAudioCapture = useCallback(async () => {
    captureGenerationRef.current += 1;
    isStartingCaptureRef.current = false;
    const hadResources = Boolean(
      isRecordingRef.current
      || scriptNodeRef.current
      || sourceNodeRef.current
      || mediaStreamRef.current
      || audioContextRef.current
    );

    isRecordingRef.current = false;
    setIsRecording(false);

    cleanupAudioCaptureNodes(scriptNodeRef, sourceNodeRef, mediaStreamRef);

    const audioContext = takeAudioContext(audioContextRef);
    if (audioContext) {
      await closeAudioContextSafely(audioContext, logUnexpectedAudioContextCloseError);
    }

    if (hadResources) {
      logVoiceDebugTrace('voice-capture-stopped', {});
    }
  }, [
    audioContextRef,
    logUnexpectedAudioContextCloseError,
    mediaStreamRef,
    scriptNodeRef,
    sourceNodeRef,
  ]);

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
