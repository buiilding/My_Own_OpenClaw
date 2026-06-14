/**
 * Defines chat stream types contracts for the renderer UI.
 */

import type { TranscriptModelContext as BaseTranscriptModelContext } from '../transcriptModelContext';

export type TranscriptModelContext = BaseTranscriptModelContext & {
  supportsThinking: boolean;
  supportsThinkingTextStream: boolean;
};
