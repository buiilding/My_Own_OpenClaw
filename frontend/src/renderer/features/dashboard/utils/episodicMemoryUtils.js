import {
  buildRehydrateToolCall,
  normalizeMessageType,
  normalizeOptionalString,
  normalizeTranscriptTransparency,
  parseToolCallPayload,
  resolveRehydrateContent,
} from '../../../infrastructure/transcript/rehydratePayload';
import {
  buildToolCallMessageState,
  buildToolBundleMessageState,
} from '../../../infrastructure/transcript/toolCallMessageState';
import {
  resolveScreenshotAttachmentState,
} from '../../../infrastructure/services/screenshotMessageState';

export const DEFAULT_USER_ID = 'default_user';

function resolveScreenshotAttachment(memory) {
  const metadata = memory?.metadata || {};
  return resolveScreenshotAttachmentState({
    screenshot: memory?.screenshot || metadata.screenshot || null,
    screenshotRef: (
      memory?.screenshot_ref
      || memory?.screenshotRef
      || metadata.screenshot_ref
      || metadata.screenshotRef
      || null
    ),
    screenshotUrl: (
      memory?.screenshot_url
      || memory?.screenshotUrl
      || metadata.screenshot_url
      || metadata.screenshotUrl
      || null
    ),
    screenshotContentType: (
      memory?.screenshot_content_type
      || memory?.screenshotContentType
      || metadata.screenshot_content_type
      || metadata.screenshotContentType
      || null
    ),
    inferArtifactRefFromScreenshot: memory?.record_kind === 'transcript',
    preserveInlineScreenshotWithRemote: true,
    deriveUrlFromRef: false,
  });
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
    const isBundleToolCall = messageType === 'tool-bundle';
    const normalizedType = messageType === 'tool-bundle'
      ? 'tool-call'
      : (messageType || (role === 'tool' ? 'tool-output' : 'llm-text'));
    const parsedBundlePayload = isBundleToolCall
      ? parseBundleToolPayload(rawContent || '')
      : null;
    const normalizedToolCallMessage = normalizedType === 'tool-call'
      ? (isBundleToolCall
        ? buildToolBundleMessageState(parsedBundlePayload)
        : buildToolCallMessageState({
          rawContent: rawContent || '',
          rawToolCall: parseToolCallPayload(rawContent || ''),
        }))
      : null;
    const shouldAttachScreenshot = sender === 'user' || normalizedType === 'tool-output';
    const correlationId = normalizeOptionalString(
      memory?.correlation_id
        || memory?.correlationId
        || memory?.metadata?.correlation_id
        || memory?.metadata?.correlationId,
    );
    return [{
      sender,
      text: normalizedToolCallMessage?.text || rawContent || '(empty)',
      type: normalizedType,
      ...(normalizedType === 'tool-call'
        ? { toolCallDisplayText: normalizedToolCallMessage?.toolCallDisplayText || rawContent || '(empty)' }
        : {}),
      ...(normalizedToolCallMessage?.modelFacingToolCall
        ? { modelFacingToolCall: normalizedToolCallMessage.modelFacingToolCall }
        : {}),
      ...(normalizedToolCallMessage?.toolCallDetails
        ? { toolCallDetails: normalizedToolCallMessage.toolCallDetails }
        : {}),
      ...(correlationId ? { correlationId } : {}),
      ...(isBundleToolCall ? { sourceEventType: 'tool-bundle' } : {}),
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

function parseBundleToolPayload(rawContent) {
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_error) {
    return undefined;
  }

  return undefined;
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
        ...(part.toolCallDetails ? { toolCallDetails: part.toolCallDetails } : {}),
        ...(part.sourceEventType ? { sourceEventType: part.sourceEventType } : {}),
        ...(part.correlationId ? { correlationId: part.correlationId } : {}),
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
  const screenshotAttachment = resolveScreenshotAttachment(memory);
  const transparency = resolveTranscriptTransparency(memory);
  const parsedToolCall = normalizedMessageType === 'tool-call'
    ? buildToolCallMessageState({
      rawContent: memory?.content || '',
      rawToolCall: parseToolCallPayload(memory?.content || ''),
      fallbackToolName: normalizeOptionalString(memory?.tool_name || metadata?.tool_name) || null,
      fallbackToolCallId: normalizeOptionalString(
        memory?.tool_call_id
          || metadata?.tool_call_id
          || memory?.correlation_id
          || metadata?.correlation_id,
      ) || null,
    }).modelFacingToolCall
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
    screenshot_ref: screenshotAttachment.screenshotRef,
    screenshot: screenshotAttachment.screenshot,
    transparency,
  };
}
