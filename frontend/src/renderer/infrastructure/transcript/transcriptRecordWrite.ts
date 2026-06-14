/**
 * Provides the transcript record write module for the renderer UI.
 */

import type { SessionInfo, TranscriptEntry } from './types';

type StoreWithRetry = (
  entry: TranscriptEntry,
  queueForRetry: () => void,
  warningMessage: string,
) => void;

type RecordImmediateTranscriptEntryOptions = {
  text: string;
  resolveSessionInfo: () => SessionInfo | null;
  queueForRetry: () => void;
  buildEntry: (info: SessionInfo) => TranscriptEntry;
  storeWithRetry: StoreWithRetry;
  warningMessage: string;
};

export const recordImmediateTranscriptEntry = (
  options: RecordImmediateTranscriptEntryOptions,
) => {
  const {
    text,
    resolveSessionInfo,
    queueForRetry,
    buildEntry,
    storeWithRetry,
    warningMessage,
  } = options;

  if (!text) {
    return;
  }

  const info = resolveSessionInfo();
  if (!info) {
    return;
  }

  storeWithRetry(buildEntry(info), queueForRetry, warningMessage);
};
