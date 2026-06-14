/**
 * Provides the assistant text chat message state module for the renderer UI.
 */

export function buildAssistantTextChatMessageState({
  id = null,
  text,
  sourceEventType = null,
  sourceChannel = null,
  turnRef = null,
  modelId = null,
  modelProvider = null,
  isComplete = null,
  thinkingText = null,
  thinkingSourceEventType = null,
}) {
  return {
    id: id || crypto.randomUUID(),
    text,
    sender: 'assistant',
    type: 'llm-text',
    ...(sourceEventType ? { sourceEventType } : {}),
    ...(sourceChannel ? { sourceChannel } : {}),
    ...(turnRef ? { turnRef } : {}),
    ...(modelId ? { modelId } : {}),
    ...(modelProvider ? { modelProvider } : {}),
    ...(isComplete !== null && isComplete !== undefined ? { isComplete } : {}),
    ...(thinkingText ? { thinkingText } : {}),
    ...(thinkingSourceEventType ? { thinkingSourceEventType } : {}),
  };
}
