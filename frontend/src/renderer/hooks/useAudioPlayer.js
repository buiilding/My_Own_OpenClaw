import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook for handling audio playback queue.
 * Manages sequential playback of audio chunks received from backend.
 * 
 * @returns {Object} - Object containing audio playback controls
 */
export function useAudioPlayer() {
  const audioQueue = useRef([]);
  const isPlaying = useRef(false);
  const audioContext = useRef(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // Initialize AudioContext lazily (browsers require user interaction)
  const getAudioContext = useCallback(() => {
    if (!audioContext.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext.current = new AudioContext();
    }
    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
    return audioContext.current;
  }, []);

  /**
   * Convert base64 string to ArrayBuffer
   */
  const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  /**
   * Create AudioBuffer from PCM data (int16)
   */
  const createAudioBuffer = (arrayBuffer, sampleRate) => {
    const ctx = getAudioContext();
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    
    // Convert Int16 to Float32
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Array);
    return audioBuffer;
  };

  /**
   * Play next chunk in queue
   */
  const playNext = useCallback(() => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      setIsAudioPlaying(false);
      return;
    }

    isPlaying.current = true;
    setIsAudioPlaying(true);
    const chunk = audioQueue.current.shift();

    try {
      const ctx = getAudioContext();
      const buffer = base64ToArrayBuffer(chunk.audio);
      const audioBuffer = createAudioBuffer(buffer, chunk.sample_rate);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        playNext();
      };
      
      source.start(0);
    } catch (error) {
      console.error('Error playing audio chunk:', error);
      playNext(); // Skip to next chunk on error
    }
  }, [getAudioContext]);

  /**
   * Enqueue audio chunk for playback
   * @param {Object} chunk - Audio chunk { audio: base64, sample_rate: number }
   */
  const enqueueAudio = useCallback((chunk) => {
    audioQueue.current.push(chunk);
    if (!isPlaying.current) {
      playNext();
    }
  }, [playNext]);

  /**
   * Clear queue and stop playback
   */
  const stopPlayback = useCallback(() => {
    audioQueue.current = [];
    isPlaying.current = false;
    setIsAudioPlaying(false);
    if (audioContext.current) {
      audioContext.current.close().then(() => {
        audioContext.current = null;
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContext.current) {
        audioContext.current.close();
      }
    };
  }, []);

  return {
    enqueueAudio,
    stopPlayback,
    isAudioPlaying
  };
}

