import type { MutableRefObject } from 'react';

export type LegacyAudioProcessEvent = {
  inputBuffer: AudioBuffer;
};

export type LegacyAudioProcessorNode = AudioNode & {
  onaudioprocess: ((event: LegacyAudioProcessEvent) => void) | null;
};

type ScriptNodeRef = MutableRefObject<LegacyAudioProcessorNode | null>;
type SourceNodeRef = MutableRefObject<MediaStreamAudioSourceNode | null>;
type MediaStreamRef = MutableRefObject<MediaStream | null>;
type AudioContextRef = MutableRefObject<AudioContext | null>;

function isAlreadyClosedAudioContextError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return message.includes('cannot close a closed audiocontext')
    || message.includes('cannot close closed audiocontext')
    || message.includes('already closed');
}

export function cleanupAudioCaptureNodes(
  scriptNodeRef: ScriptNodeRef,
  sourceNodeRef: SourceNodeRef,
  mediaStreamRef: MediaStreamRef,
): void {
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
    mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }
}

export function takeAudioContext(audioContextRef: AudioContextRef): AudioContext | null {
  const audioContext = audioContextRef.current;
  audioContextRef.current = null;
  return audioContext;
}

export async function closeAudioContextSafely(
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
