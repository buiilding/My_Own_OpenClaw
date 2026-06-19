/**
 * Defines renderer chat-stream model context contracts.
 */

export type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
  supportsThinking: boolean;
  supportsThinkingTextStream: boolean;
};
