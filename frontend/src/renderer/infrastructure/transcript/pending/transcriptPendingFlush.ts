import type { TranscriptEntry } from '../types';

type WarnFn = (message: string, error: unknown) => void;

type FlushPendingEntriesOptions<T> = {
  messages: T[];
  toTranscriptEntry: (message: T) => TranscriptEntry;
  requeue: (messages: T[]) => void;
  category: 'user' | 'assistant' | 'tool';
  storeTranscriptEntry: (entry: TranscriptEntry) => Promise<void>;
  warn: WarnFn;
};

export const requeuePending = <T>(messages: T[], enqueue: (message: T) => void) => {
  for (const message of messages) {
    enqueue(message);
  }
};

export const flushPendingEntries = async <T>({
  messages,
  toTranscriptEntry,
  requeue,
  category,
  storeTranscriptEntry,
  warn,
}: FlushPendingEntriesOptions<T>): Promise<boolean> => {
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    try {
      await storeTranscriptEntry(toTranscriptEntry(message));
    } catch (error) {
      requeue(messages.slice(index));
      warn(
        `[TranscriptWriter] Failed to flush pending ${category} transcript entries; requeued ${messages.length - index}`,
        error,
      );
      return false;
    }
  }
  return true;
};
