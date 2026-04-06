import type { TranscriptModelContext as BaseTranscriptModelContext } from '../transcriptModelContext';

export type TranscriptModelContext = BaseTranscriptModelContext & {
  supportsThinking: boolean;
  supportsThinkingTextStream: boolean;
};
