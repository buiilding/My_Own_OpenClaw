import {
  buildRehydrateMessagePayload,
} from '../../../infrastructure/transcript/rehydrateMessageState';
import {
  buildStoredTranscriptChatMessages,
} from '../../../infrastructure/transcript/storedTranscriptChatMessageState';
import {
  resolveStoredTranscriptMemoryState,
} from '../../../infrastructure/transcript/storedTranscriptMemoryState';

export const DEFAULT_USER_ID = 'default_user';

export function parseMemoriesToMessages(memories) {
  return memories.flatMap((memory, index) => buildStoredTranscriptChatMessages(memory, index));
}

export function toRehydrateMessagePayload(memory) {
  const normalizedMemory = resolveStoredTranscriptMemoryState(memory);
  return buildRehydrateMessagePayload({
    role: normalizedMemory.role || 'assistant',
    messageType: normalizedMemory.messageType,
    rawContent: normalizedMemory.rawContent,
    timestamp: normalizedMemory.timestamp,
    correlationId: normalizedMemory.correlationId,
    transparency: normalizedMemory.transparency,
    screenshotAttachment: normalizedMemory.screenshotAttachment,
    structuredPayload: normalizedMemory.structuredToolPayload,
    fallbackToolName: normalizedMemory.toolName,
    fallbackToolCallId: normalizedMemory.toolCallId || normalizedMemory.correlationId,
  });
}
