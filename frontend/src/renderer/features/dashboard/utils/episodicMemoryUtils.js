export const DEFAULT_USER_ID = 'default_user';
export const UNASSIGNED_CONVERSATION_KEY = '__unassigned_conversation__';

export function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'Unknown time';
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return parsed.toLocaleString();
}

export function parseMemoryContent(memory) {
  if (!memory) {
    return [];
  }

  const rawContent = memory.content || '';
  const role = memory.role || memory.metadata?.role;
  const messageType = memory.message_type || memory.metadata?.message_type;
  const screenshot = memory.screenshot || memory.metadata?.screenshot || null;

  if (role) {
    const sender = role === 'user' ? 'user' : 'assistant';
    const normalizedType = messageType === 'tool-bundle'
      ? 'tool-call'
      : (messageType || (role === 'tool' ? 'tool-output' : 'llm-text'));
    const shouldAttachScreenshot = sender === 'user' || normalizedType === 'tool-output';
    return [{
      sender,
      text: rawContent || '(empty)',
      type: normalizedType,
      screenshot: shouldAttachScreenshot ? screenshot : null,
    }];
  }

  const content = rawContent.replace(/\r\n/g, '\n').trim();
  if (!content) {
    return [];
  }

  const userPrefix = 'User:';
  const assistantMarker = '\nAssistant:';

  if (content.startsWith(userPrefix) && content.includes(assistantMarker)) {
    const assistantIndex = content.indexOf(assistantMarker);
    const userText = content.slice(userPrefix.length, assistantIndex).trim();
    const assistantText = content.slice(assistantIndex + assistantMarker.length).trim();

    return [
      { sender: 'user', text: userText || '(empty)', type: 'user' },
      { sender: 'assistant', text: assistantText || '(empty)', type: 'llm-text' },
    ];
  }

  return [{ sender: 'assistant', text: content, type: 'llm-text' }];
}

export function buildConversationKey(conversation) {
  const recordKind = conversation?.record_kind || 'memory';
  const conversationId = conversation?.conversation_id ?? UNASSIGNED_CONVERSATION_KEY;
  return `${recordKind}::${conversationId}`;
}

export function toTimestampValue(timestamp) {
  if (!timestamp) {
    return 0;
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatModelLabel(conversation) {
  if (!conversation) {
    return 'Unknown model';
  }
  const modelId = conversation.model_id || conversation.modelId || '';
  const modelProvider = conversation.model_provider || conversation.modelProvider || '';
  if (modelId && modelProvider) {
    return `${modelProvider}/${modelId}`;
  }
  return modelId || modelProvider || 'Unknown model';
}

export function parseMemoriesToMessages(memories) {
  return memories.flatMap((memory, index) => {
    const parts = parseMemoryContent(memory);
    return parts.map((part, partIndex) => ({
      id: `${memory.id || index}-${partIndex}`,
      text: part.text,
      sender: part.sender,
      type: part.type,
      isComplete: true,
    }));
  });
}
