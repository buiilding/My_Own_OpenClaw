import {
  buildRehydrateToolCall,
  normalizeMessageType,
  normalizeOptionalString,
  normalizeTranscriptTransparency,
  parseToolCallPayload,
  resolveRehydrateContent,
} from '../../../infrastructure/transcript/rehydratePayload';

export const DEFAULT_USER_ID = 'default_user';

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

function parseMemoryContent(memory) {
  if (!memory) {
    return [];
  }

  const rawContent = memory.content || '';
  const role = memory.role || memory.metadata?.role;
  const messageType = memory.message_type || memory.metadata?.message_type;
  const modelProvider = normalizeOptionalString(
    memory?.model_provider
      || memory?.modelProvider
      || memory?.metadata?.model_provider
      || memory?.metadata?.modelProvider,
  );
  const modelId = normalizeOptionalString(
    memory?.model_id
      || memory?.modelId
      || memory?.metadata?.model_id
      || memory?.metadata?.modelId,
  );
  const screenshotAttachment = resolveScreenshotAttachment(memory);

  if (role) {
    const sender = role === 'user' ? 'user' : 'assistant';
    const normalizedType = messageType === 'tool-bundle'
      ? 'tool-call'
      : (messageType || (role === 'tool' ? 'tool-output' : 'llm-text'));
    const normalizedToolCall = normalizedType === 'tool-call'
      ? buildRehydrateToolCall({
        parsedToolCall: parseToolCallPayload(rawContent || ''),
        fallbackToolName: null,
        fallbackToolCallId: null,
      })
      : null;
    const shouldAttachScreenshot = sender === 'user' || normalizedType === 'tool-output';
    return [{
      sender,
      text: rawContent || '(empty)',
      type: normalizedType,
      ...(normalizedType === 'tool-call'
        ? { toolCallDisplayText: rawContent || '(empty)' }
        : {}),
      ...(normalizedToolCall ? { modelFacingToolCall: normalizedToolCall } : {}),
      modelProvider,
      modelId,
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
      { sender: 'user', text: userText || '(empty)', type: 'user', modelProvider, modelId },
      { sender: 'assistant', text: assistantText || '(empty)', type: 'llm-text', modelProvider, modelId },
    ];
  }

  return [{ sender: 'assistant', text: content, type: 'llm-text', modelProvider, modelId }];
}

function resolveTranscriptTransparency(memory) {
  const metadata = (
    memory?.metadata
    && typeof memory.metadata === 'object'
    && !Array.isArray(memory.metadata)
  ) ? memory.metadata : {};
  return normalizeTranscriptTransparency(metadata.transparency);
}

function buildMessageTransparencyFields(part, partCount, transparency) {
  if (!transparency || typeof transparency !== 'object') {
    return {};
  }

  const fields = {};
  const canAttachUserContext = part.sender === 'user' || partCount === 1;
  const systemPrompt = normalizeOptionalString(transparency.systemPrompt);
  const toolSchemas = (
    Array.isArray(transparency.toolSchemas) && transparency.toolSchemas.length > 0
  ) ? transparency.toolSchemas : null;

  if (canAttachUserContext && (systemPrompt || toolSchemas)) {
    fields.systemPrompt = {
      ...(systemPrompt ? { content: systemPrompt } : {}),
      ...(toolSchemas ? { toolSchemas } : {}),
    };
  }
  if (canAttachUserContext && toolSchemas) {
    fields.toolSchemas = toolSchemas;
  }

  const fullUserContent = normalizeOptionalString(transparency?.fullUserMessage?.content);
  const fullUserMetadata = (
    transparency?.fullUserMessage?.metadata
    && typeof transparency.fullUserMessage.metadata === 'object'
    && !Array.isArray(transparency.fullUserMessage.metadata)
  ) ? transparency.fullUserMessage.metadata : null;
  if (canAttachUserContext && (fullUserContent || fullUserMetadata)) {
    fields.fullUserMessage = {
      ...(fullUserContent ? { content: fullUserContent } : {}),
      ...(fullUserMetadata ? { metadata: fullUserMetadata } : {}),
    };
  }

  const fullAssistantContent = normalizeOptionalString(transparency?.fullAssistantMessage?.content);
  if (part.sender === 'assistant' && fullAssistantContent) {
    fields.fullAssistantMessage = {
      content: fullAssistantContent,
    };
  }

  return fields;
}

export function parseMemoriesToMessages(memories) {
  return memories.flatMap((memory, index) => {
    const parts = parseMemoryContent(memory);
    const transparency = resolveTranscriptTransparency(memory);
    const partCount = parts.length;
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
      const modelFields = {};
      if (part.modelProvider) {
        modelFields.modelProvider = part.modelProvider;
      }
      if (part.modelId) {
        modelFields.modelId = part.modelId;
      }
      const transparencyFields = buildMessageTransparencyFields(part, partCount, transparency);

      return {
        id: `${memory.id || index}-${partIndex}`,
        text: part.text,
        sender: part.sender,
        type: part.type,
        ...(part.toolCallDisplayText ? { toolCallDisplayText: part.toolCallDisplayText } : {}),
        ...(part.modelFacingToolCall ? { modelFacingToolCall: part.modelFacingToolCall } : {}),
        ...modelFields,
        ...screenshotFields,
        ...transparencyFields,
        isComplete: true,
      };
    });
  });
}

export function toRehydrateMessagePayload(memory) {
  const metadata = memory?.metadata || {};
  const role = memory?.role || metadata?.role || 'assistant';
  const messageType = memory?.message_type || metadata?.message_type || null;
  const normalizedMessageType = normalizeMessageType(messageType);
  const rawScreenshot = memory?.screenshot || metadata?.screenshot || null;
  const screenshotInline = looksLikeInlineImageData(rawScreenshot);
  const screenshotRef = memory?.screenshot_ref
    || metadata?.screenshot_ref
    || (!screenshotInline && typeof rawScreenshot === 'string' ? rawScreenshot : null);
  const transparency = resolveTranscriptTransparency(memory);
  const parsedToolCall = normalizedMessageType === 'tool-call'
    ? parseToolCallPayload(memory?.content || '')
    : null;
  const resolvedToolCallId = normalizeOptionalString(
    memory?.tool_call_id
      || metadata?.tool_call_id
      || memory?.correlation_id
      || metadata?.correlation_id
      || parsedToolCall?.id,
  );
  const resolvedToolName = normalizeOptionalString(
    memory?.tool_name
      || metadata?.tool_name
      || parsedToolCall?.name,
  );
  const normalizedToolCall = normalizedMessageType === 'tool-call'
    ? buildRehydrateToolCall({
      parsedToolCall,
      fallbackToolName: resolvedToolName,
      fallbackToolCallId: resolvedToolCallId,
    })
    : null;
  const content = resolveRehydrateContent(
    {
      role,
      messageType,
      content: memory?.content || '',
      transparency,
    },
  );

  return {
    role,
    content,
    message_type: messageType,
    tool_name: resolvedToolName,
    correlation_id: memory?.correlation_id || metadata?.correlation_id || null,
    tool_call_id: resolvedToolCallId,
    tool_calls: normalizedToolCall ? [normalizedToolCall] : null,
    timestamp: memory?.timestamp || null,
    screenshot_ref: screenshotRef,
    screenshot: screenshotInline ? rawScreenshot : null,
    transparency,
  };
}
