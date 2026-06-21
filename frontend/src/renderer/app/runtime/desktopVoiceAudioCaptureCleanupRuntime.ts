/**
 * Provides voice audio capture cleanup helpers for the renderer app-runtime.
 */

import type { MutableRefObject } from 'react';

type ProcessorNodeRef = MutableRefObject<AudioWorkletNode | null>;
type SourceNodeRef = MutableRefObject<MediaStreamAudioSourceNode | null>;
type MediaStreamRef = MutableRefObject<MediaStream | null>;
type AudioContextRef = MutableRefObject<AudioContext | null>;

function isAlreadyClosedAudioContextError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return message.includes('cannot close a closed audiocontext')
    || message.includes('cannot close closed audiocontext')
    || message.includes('already closed');
}

function cleanupAudioCaptureNodes(
  processorNodeRef: ProcessorNodeRef,
  sourceNodeRef: SourceNodeRef,
  mediaStreamRef: MediaStreamRef,
): void {
  if (processorNodeRef.current) {
    processorNodeRef.current.disconnect();
    processorNodeRef.current.port.onmessage = null;
    processorNodeRef.current = null;
  }

  if (sourceNodeRef.current) {
    sourceNodeRef.current.disconnect();
    sourceNodeRef.current = null;
  }

  if (mediaStreamRef.current) {
    mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }
}

function takeAudioContext(audioContextRef: AudioContextRef): AudioContext | null {
  const audioContext = audioContextRef.current;
  audioContextRef.current = null;
  return audioContext;
}

async function closeAudioContextSafely(
  audioContext: AudioContext | null,
  onUnexpectedCloseError?: (error: unknown) => void,
): Promise<void> {
  if (!audioContext || audioContext.state === 'closed') {
    return;
  }

  try {
    await audioContext.close();
  } catch (error) {
    if (!isAlreadyClosedAudioContextError(error)) {
      onUnexpectedCloseError?.(error);
    }
  }
}

export const DesktopVoiceAudioCaptureCleanupRuntime = Object.freeze({
  cleanupAudioCaptureNodes,
  closeAudioContextSafely,
  takeAudioContext,
});
