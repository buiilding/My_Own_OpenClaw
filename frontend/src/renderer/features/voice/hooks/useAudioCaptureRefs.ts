/**
 * Provides the use audio capture refs module for the renderer UI.
 */

import { useCallback, useRef } from 'react';

export function useAudioCaptureRefs() {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<AudioWorkletNode | null>(null);

  const setMediaStreamRef = useCallback((nextValue: MediaStream | null) => {
    mediaStreamRef.current = nextValue;
  }, []);

  const setAudioContextRef = useCallback((nextValue: AudioContext | null) => {
    audioContextRef.current = nextValue;
  }, []);

  const setSourceNodeRef = useCallback((nextValue: MediaStreamAudioSourceNode | null) => {
    sourceNodeRef.current = nextValue;
  }, []);

  const setProcessorNodeRef = useCallback((nextValue: AudioWorkletNode | null) => {
    processorNodeRef.current = nextValue;
  }, []);

  return {
    mediaStreamRef,
    audioContextRef,
    sourceNodeRef,
    processorNodeRef,
    setMediaStreamRef,
    setAudioContextRef,
    setSourceNodeRef,
    setProcessorNodeRef,
  };
}
