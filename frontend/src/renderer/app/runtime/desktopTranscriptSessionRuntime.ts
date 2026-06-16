/**
 * Coordinates the desktop transcript session runtime for the renderer UI.
 */

import { createTranscriptSessionRuntime } from '../../infrastructure/transcript/transcriptSessionRuntime';

type SessionRuntimeUpdateListener = () => void;

const sessionRuntimeUpdateListeners = new Set<SessionRuntimeUpdateListener>();

export const desktopTranscriptSessionRuntime = createTranscriptSessionRuntime({
  onSessionUpdated: () => {
    for (const listener of sessionRuntimeUpdateListeners) {
      listener();
    }
  },
});

export function subscribeDesktopTranscriptSessionRuntimeUpdates(
  listener: SessionRuntimeUpdateListener,
): () => void {
  sessionRuntimeUpdateListeners.add(listener);
  return () => {
    sessionRuntimeUpdateListeners.delete(listener);
  };
}
