/**
 * Provides the use voice mode module for the renderer UI.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DesktopVoiceAudioEncodingRuntime } from '../../../app/runtime/desktopVoiceAudioEncodingRuntime';
import { DesktopVoiceAudioCaptureCleanupRuntime } from '../../../app/runtime/desktopVoiceAudioCaptureCleanupRuntime';
import { createAudioCaptureProcessorNode } from '../../../app/runtime/desktopVoiceAudioProcessorNodeRuntime';
import { useAudioCaptureRefs } from './useAudioCaptureRefs';
import { useLatestRef } from '../../../app/runtime/desktopRendererHooksRuntimeClient';
import { DesktopVoiceRuntimeClient } from '../../../app/runtime/desktopVoiceRuntimeClient';
import { DesktopVoiceDebugTraceRuntime } from '../../../app/runtime/desktopVoiceDebugTraceRuntime';

const {
  cleanupAudioCaptureNodes,
  closeAudioContextSafely,
  takeAudioContext,
} = DesktopVoiceAudioCaptureCleanupRuntime;
const { logVoiceDebugTrace } = DesktopVoiceDebugTraceRuntime;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE_MS = 1000;

function getReconnectDelayMs(attempt: number): number {
  return RECONNECT_DELAY_BASE_MS * Math.pow(2, attempt - 1);
}

/**
 * Custom hook for managing voice mode functionality.
 * Connects to the desktop transcription gateway, captures audio,
 * and handles transcription.
 * 
 * @param {boolean} enabled - Whether voice mode is enabled
 * @param {Function} onTranscriptionUpdate - Callback when transcription text updates
 * @param {Function} onUtteranceEnd - Callback when utterance ends (silence detected)
 * @param {string} gatewayUrl - Transcription gateway WebSocket URL
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
    processorNodeRef,
    setMediaStreamRef,
    setAudioContextRef,
    setSourceNodeRef,
    setProcessorNodeRef,
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

  // Connect to the desktop transcription gateway.
  const connectWebSocket = useCallback(() => {
    if (DesktopVoiceRuntimeClient.isTranscriptionWebSocketActive(websocketRef.current)) {
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
          DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage(event.data, {
            onBinaryMessage: () => {
              console.warn('[VoiceMode] Received unexpected binary message');
            },
            onClientId: (nextClientId) => {
              setClientId(nextClientId);
              logVoiceDebugTrace('voice-gateway-client-id', {
                clientId: nextClientId,
              });
            },
            onRealtimeText: (text, isFinal) => {
              onTranscriptionUpdateRef.current?.(text, isFinal);
            },
            onUtteranceEnd: () => {
              // Silence detected; notify the caller to end the temporary dictation session.
              logVoiceDebugTrace('voice-utterance-ended', {});
              if (onUtteranceEndRef.current) {
                onUtteranceEndRef.current();
              }
              DesktopVoiceRuntimeClient.sendTranscriptionStartOverIfOpen(ws);
            },
            onTraceEvent: (traceEvent) => {
              logVoiceDebugTrace('voice-transcription-trace', {
                ...traceEvent,
              });
            },
            onUnknownMessage: (messageType) => {
              logVoiceDebugTrace('voice-gateway-unknown-message', {
                messageType,
              });
            },
          });
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

      const processorNode = await createAudioCaptureProcessorNode({
        audioContext,
        sourceNode,
        chunkSize: 4096,
        onChunk: (inputData) => {
          if (!isRecordingRef.current) {
            return;
          }

          const int16Data = DesktopVoiceAudioEncodingRuntime.float32ToPcm16(inputData);
          const message = DesktopVoiceAudioEncodingRuntime.buildGatewayAudioMessage(int16Data, 16000);

          try {
            DesktopVoiceRuntimeClient.sendTranscriptionAudioMessageIfOpen(websocketRef.current, message);
          } catch (err) {
            console.error('[VoiceMode] Error sending audio:', err);
          }
        },
      });

      if (generation !== captureGenerationRef.current || !enabledRef.current) {
        processorNode.disconnect();
        processorNode.port.onmessage = null;
        stream.getTracks().forEach((track) => track.stop());
        await closeAudioContextSafely(audioContext, logUnexpectedAudioContextCloseError);
        return;
      }

      setProcessorNodeRef(processorNode);

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
    setProcessorNodeRef,
    setSourceNodeRef,
  ]);

  // Stop audio capture
  const stopAudioCapture = useCallback(async () => {
    captureGenerationRef.current += 1;
    isStartingCaptureRef.current = false;
    const hadResources = Boolean(
      isRecordingRef.current
      || processorNodeRef.current
      || sourceNodeRef.current
      || mediaStreamRef.current
      || audioContextRef.current
    );

    isRecordingRef.current = false;
    setIsRecording(false);

    cleanupAudioCaptureNodes(processorNodeRef, sourceNodeRef, mediaStreamRef);

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
    processorNodeRef,
    sourceNodeRef,
  ]);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    clearReconnectTimeout();

    DesktopVoiceRuntimeClient.closeTranscriptionWebSocket(websocketRef.current);
    websocketRef.current = null;

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
