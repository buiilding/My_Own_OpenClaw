/**
 * Provides the use audio capture refs module for the renderer UI.
 */

import { useCallback, useRef } from 'react';
import type { LegacyAudioProcessorNode } from '../utils/audioCaptureCleanup';

export function useAudioCaptureRefs() {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptNodeRef = useRef<LegacyAudioProcessorNode | null>(null);

  const setMediaStreamRef = useCallback((nextValue: MediaStream | null) => {
    mediaStreamRef.current = nextValue;
  }, []);

  const setAudioContextRef = useCallback((nextValue: AudioContext | null) => {
    audioContextRef.current = nextValue;
  }, []);

  const setSourceNodeRef = useCallback((nextValue: MediaStreamAudioSourceNode | null) => {
    sourceNodeRef.current = nextValue;
  }, []);

  const setScriptNodeRef = useCallback((nextValue: LegacyAudioProcessorNode | null) => {
    scriptNodeRef.current = nextValue;
  }, []);

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
