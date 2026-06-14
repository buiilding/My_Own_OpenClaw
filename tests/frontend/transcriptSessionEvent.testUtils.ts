/**
 * Covers transcript session event. utils behavior in the frontend test suite.
 */

export type TranscriptSessionUpdateDetail = {
  conversationRef: string | null;
  userId: string | null;
};

export function createSessionUpdateRecorder() {
  const updates: TranscriptSessionUpdateDetail[] = [];
  const handler = (event: Event) => {
    updates.push((event as CustomEvent<TranscriptSessionUpdateDetail>).detail);
  };
  return { updates, handler };
}

export async function withTranscriptSessionUpdateListener<T>(
  handler: (event: Event) => void,
  run: () => Promise<T> | T,
) {
  window.addEventListener('transcript-session-update', handler);
  try {
    return await run();
  } finally {
    window.removeEventListener('transcript-session-update', handler);
  }
}
