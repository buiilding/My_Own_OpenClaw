export const DEFAULT_USER_ID = 'default_user';
const UNASSIGNED_CONVERSATION_KEY = '__unassigned_conversation__';

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function looksLikeInlineImageData(value) {
  if (!value) {
    return false;
  }
  if (value.startsWith('data:image/')) {
    return true;
  }
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length >= 128;
}

function resolveScreenshotAttachment(memory) {
  const metadata = memory?.metadata || {};
  const screenshotRef = normalizeOptionalString(
    memory?.screenshot_ref
      || memory?.screenshotRef
      || metadata.screenshot_ref
      || metadata.screenshotRef,
  );
  const screenshotUrl = normalizeOptionalString(
    memory?.screenshot_url
      || memory?.screenshotUrl
      || metadata.screenshot_url
      || metadata.screenshotUrl,
  );
  const screenshotContentType = normalizeOptionalString(
    memory?.screenshot_content_type
      || memory?.screenshotContentType
      || metadata.screenshot_content_type
      || metadata.screenshotContentType,
  );
  const rawScreenshot = normalizeOptionalString(memory?.screenshot || metadata.screenshot);
  const inferredScreenshotRef = !screenshotRef
    && rawScreenshot
    && memory?.record_kind === 'transcript'
    && !looksLikeInlineImageData(rawScreenshot)
    ? rawScreenshot
    : null;
  const screenshot = inferredScreenshotRef ? null : rawScreenshot;

  return {
    screenshot,
    screenshotRef: screenshotRef || inferredScreenshotRef,
    screenshotUrl,
    screenshotContentType,
  };
}

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

function parseMemoryContent(memory) {
  if (!memory) {
    return [];
  }

  const rawContent = memory.content || '';
  const role = memory.role || memory.metadata?.role;
  const messageType = memory.message_type || memory.metadata?.message_type;
  const screenshotAttachment = resolveScreenshotAttachment(memory);

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
      screenshot: shouldAttachScreenshot ? screenshotAttachment.screenshot : null,
      screenshotRef: shouldAttachScreenshot ? screenshotAttachment.screenshotRef : null,
      screenshotUrl: shouldAttachScreenshot ? screenshotAttachment.screenshotUrl : null,
      screenshotContentType: shouldAttachScreenshot ? screenshotAttachment.screenshotContentType : null,
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
    return parts.map((part, partIndex) => {
      const screenshotFields = {};
      if (part.screenshot) {
        screenshotFields.screenshot = part.screenshot;
      }
      if (part.screenshotRef) {
        screenshotFields.screenshotRef = part.screenshotRef;
      }
      if (part.screenshotUrl) {
        screenshotFields.screenshotUrl = part.screenshotUrl;
      }
      if (part.screenshotContentType) {
        screenshotFields.screenshotContentType = part.screenshotContentType;
      }

      return {
        id: `${memory.id || index}-${partIndex}`,
        text: part.text,
        sender: part.sender,
        type: part.type,
        ...screenshotFields,
        isComplete: true,
      };
    });
  });
}

export function toRehydrateMessagePayload(memory) {
  const metadata = memory?.metadata || {};
  const role = memory?.role || metadata?.role || 'assistant';
  const messageType = memory?.message_type || metadata?.message_type || null;
  const rawScreenshot = memory?.screenshot || metadata?.screenshot || null;
  const screenshotInline = looksLikeInlineImageData(rawScreenshot);
  const screenshotRef = memory?.screenshot_ref
    || metadata?.screenshot_ref
    || (!screenshotInline && typeof rawScreenshot === 'string' ? rawScreenshot : null);

  return {
    role,
    content: memory?.content || '',
    message_type: messageType,
    tool_name: memory?.tool_name || metadata?.tool_name || null,
    correlation_id: memory?.correlation_id || metadata?.correlation_id || null,
    timestamp: memory?.timestamp || null,
    screenshot_ref: screenshotRef,
    screenshot: screenshotInline ? rawScreenshot : null,
  };
}
