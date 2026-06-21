/**
 * Coordinates desktop audio side-channel subscriptions for renderer clients.
 */

import { PlayerService } from '../../infrastructure/audio/PlayerService';
import { IpcBridge } from '../../infrastructure/ipc/bridge';
import { ON_CHANNELS } from '../../infrastructure/ipc/channels';

export type DesktopAudioChunk = {
  audio: string;
  sample_rate: number;
};

export type DesktopAudioChunkListener = (payload: DesktopAudioChunk) => void;

function extractDesktopAudioChunkPayload(data: unknown): DesktopAudioChunk | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const event = data as { type?: unknown; payload?: unknown };
  if (event.type !== 'audio-chunk' || !event.payload || typeof event.payload !== 'object') {
    return null;
  }

  const payload = event.payload as { audio?: unknown; sample_rate?: unknown };
  if (typeof payload.audio !== 'string' || typeof payload.sample_rate !== 'number') {
    return null;
  }

  return { audio: payload.audio, sample_rate: payload.sample_rate };
}

export const DesktopAudioRuntimeClient = {
  createAudioPlayer(): PlayerService {
    return new PlayerService();
  },

  onAudioChunk(listener: DesktopAudioChunkListener): (() => void) | undefined {
    if (!ON_CHANNELS?.AUDIO_CHUNK) {
      return undefined;
    }
    return IpcBridge.on(ON_CHANNELS.AUDIO_CHUNK, (data) => {
      const audioChunk = extractDesktopAudioChunkPayload(data);
      if (audioChunk) {
        listener(audioChunk);
      }
    });
  },
};
