/**
 * Audio Player Service.
 * Handles audio playback queue management.
 * Pure infrastructure code - no React dependencies.
 */

/**
 * Audio chunk structure
 */
export interface AudioChunk {
  audio: string; // base64-encoded PCM data
  sample_rate: number;
}

/**
 * Audio Player Service class.
 * Manages sequential playback of audio chunks.
 */
export class PlayerService {
  private audioQueue: AudioChunk[] = [];
  private isPlaying: boolean = false;
  private audioContext: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private playbackGeneration: number = 0;

  /**
   * Get or create AudioContext (lazy initialization)
   */
  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {
        // Ignore resume errors; playback attempt will fail in playNext if context is unusable.
      });
    }
    return this.audioContext;
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Create AudioBuffer from PCM data (int16)
   */
  private createAudioBuffer(arrayBuffer: ArrayBuffer, sampleRate: number): AudioBuffer {
    const ctx = this.getAudioContext();
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    
    // Convert Int16 to Float32
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Array);
    return audioBuffer;
  }

  /**
   * Play next chunk in queue
   */
  private playNext(): void {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      this.activeSource = null;
      return;
    }

    this.isPlaying = true;
    const playbackGeneration = this.playbackGeneration;
    const chunk = this.audioQueue.shift()!;
    let source: AudioBufferSourceNode | null = null;

    try {
      const ctx = this.getAudioContext();
      const buffer = this.base64ToArrayBuffer(chunk.audio);
      const audioBuffer = this.createAudioBuffer(buffer, chunk.sample_rate);
      
      source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      this.activeSource = source;
      
      source.onended = () => {
        if (this.playbackGeneration !== playbackGeneration) {
          return;
        }
        if (this.activeSource === source) {
          this.activeSource = null;
        }
        this.playNext();
      };
      
      source.start(0);
    } catch (error) {
      if (source && this.activeSource === source) {
        this.activeSource = null;
      }
      console.error('[PlayerService] Error playing audio chunk:', error);
      this.playNext(); // Skip to next chunk on error
    }
  }

  /**
   * Enqueue audio chunk for playback
   * @param chunk - Audio chunk { audio: base64, sample_rate: number }
   */
  enqueueAudio(chunk: AudioChunk): void {
    this.audioQueue.push(chunk);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  /**
   * Clear queue and stop playback
   */
  stopPlayback(): void {
    this.playbackGeneration += 1;
    this.audioQueue = [];
    this.isPlaying = false;

    if (this.activeSource) {
      this.activeSource.onended = null;
      try {
        this.activeSource.stop(0);
      } catch (error) {
        // Ignore source stop errors for already-ended sources.
      }
      try {
        this.activeSource.disconnect();
      } catch (error) {
        // Ignore source disconnect errors during cleanup.
      }
      this.activeSource = null;
    }

    const contextToClose = this.audioContext;
    this.audioContext = null;
    if (contextToClose) {
      contextToClose.close().catch(() => {
        // Ignore close errors for already-closed contexts.
      });
    }
  }

  /**
   * Check if audio is currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Cleanup - close audio context
   */
  cleanup(): void {
    this.stopPlayback();
  }
}
