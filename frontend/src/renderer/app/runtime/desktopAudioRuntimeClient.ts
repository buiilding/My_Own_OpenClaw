/**
 * Coordinates desktop audio side-channel subscriptions for renderer clients.
 */

import { PlayerService } from '../../infrastructure/audio/PlayerService';
import { IpcBridge, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

export type DesktopAudioChunkListener = (payload: unknown) => void;

export const DesktopAudioRuntimeClient = {
  createAudioPlayer(): PlayerService {
    return new PlayerService();
  },

  onAudioChunk(listener: DesktopAudioChunkListener): (() => void) | undefined {
    if (!ON_CHANNELS?.AUDIO_CHUNK) {
      return undefined;
    }
    return IpcBridge.on(ON_CHANNELS.AUDIO_CHUNK, listener);
  },
};
