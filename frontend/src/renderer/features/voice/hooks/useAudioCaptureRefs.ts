import { useRef } from 'react';
import type { LegacyAudioProcessorNode } from '../utils/audioCaptureCleanup';

export function useAudioCaptureRefs() {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptNodeRef = useRef<LegacyAudioProcessorNode | null>(null);

  const setMediaStreamRef = (nextValue: MediaStream | null) => {
    mediaStreamRef.current = nextValue;
  };

  const setAudioContextRef = (nextValue: AudioContext | null) => {
    audioContextRef.current = nextValue;
  };

  const setSourceNodeRef = (nextValue: MediaStreamAudioSourceNode | null) => {
    sourceNodeRef.current = nextValue;
  };

  const setScriptNodeRef = (nextValue: LegacyAudioProcessorNode | null) => {
    scriptNodeRef.current = nextValue;
  };

  return {
    mediaStreamRef,
    audioContextRef,
    sourceNodeRef,
    scriptNodeRef,
    setMediaStreamRef,
    setAudioContextRef,
    setSourceNodeRef,
    setScriptNodeRef,
  };
}
