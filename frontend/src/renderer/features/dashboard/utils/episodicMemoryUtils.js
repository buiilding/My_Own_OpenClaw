import {
  normalizeOptionalString,
} from '../../../infrastructure/transcript/rehydratePayload';
import {
  buildRehydrateMessagePayload,
} from '../../../infrastructure/transcript/rehydrateMessageState';
import {
  buildStoredTranscriptToolMessageState,
} from '../../../infrastructure/transcript/structuredToolPayload';
import {
  resolveStoredTranscriptMemoryState,
} from '../../../infrastructure/transcript/storedTranscriptMemoryState';

export const DEFAULT_USER_ID = 'default_user';

function parseMemoryContent(memory, normalizedMemory = null) {
  if (!memory) {
    return [];
  }

  const resolvedMemory = normalizedMemory || resolveStoredTranscriptMemoryState(memory);
  const {
    rawContent,
    role,
    messageType,
    modelProvider,
    modelId,
    correlationId,
    structuredToolPayload,
    screenshotAttachment,
  } = resolvedMemory;

  if (role) {
    const sender = role === 'user' ? 'user' : 'assistant';
    const normalizedType = messageType === 'tool-bundle'
      ? 'tool-call'
      : (messageType || (role === 'tool' ? 'tool-output' : 'llm-text'));
    const storedToolMessageState = buildStoredTranscriptToolMessageState({
      messageType,
      rawContent,
      structuredPayload: structuredToolPayload,
    });
    const shouldAttachScreenshot = sender === 'user' || normalizedType === 'tool-output';
    return [{
      sender,
      text: storedToolMessageState?.text || rawContent || '(empty)',
      type: storedToolMessageState?.type || normalizedType,
      ...(storedToolMessageState?.toolCallDisplayText
        ? { toolCallDisplayText: storedToolMessageState.toolCallDisplayText }
        : {}),
      ...(storedToolMessageState?.modelFacingToolCall
        ? { modelFacingToolCall: storedToolMessageState.modelFacingToolCall }
        : {}),
      ...(storedToolMessageState?.toolCallDetails
        ? { toolCallDetails: storedToolMessageState.toolCallDetails }
        : {}),
      ...(storedToolMessageState?.modelFacingToolOutput
        ? { modelFacingToolOutput: storedToolMessageState.modelFacingToolOutput }
        : {}),
      ...(storedToolMessageState?.toolOutputDetails
        ? { toolOutputDetails: storedToolMessageState.toolOutputDetails }
        : {}),
      ...(correlationId ? { correlationId } : {}),
      ...(storedToolMessageState?.sourceEventType
        ? { sourceEventType: storedToolMessageState.sourceEventType }
        : {}),
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
    const normalizedMemory = resolveStoredTranscriptMemoryState(memory);
    const parts = parseMemoryContent(memory, normalizedMemory);
    const transparency = normalizedMemory.transparency;
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
        ...(part.modelFacingToolOutput ? { modelFacingToolOutput: part.modelFacingToolOutput } : {}),
        ...(part.toolOutputDetails ? { toolOutputDetails: part.toolOutputDetails } : {}),
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
