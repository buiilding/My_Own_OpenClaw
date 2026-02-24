import { useRef } from 'react';

export function useAudioCaptureRefs() {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);

  return {
    mediaStreamRef,
    audioContextRef,
    sourceNodeRef,
    scriptNodeRef,
  };
}
