/**
 * Stores and retrieves stored transcript chat message state state for the renderer UI.
 */

import {
  normalizeTransparencyData,
} from './transparencyNormalization';
import {
  buildStoredTranscriptToolMessageState,
} from './structuredToolPayload';
import {
  buildToolCallChatMessageState,
} from './toolCallChatMessageState';
import {
  buildToolOutputChatMessageState,
} from './toolOutputChatMessageState';
import {
  buildAssistantTextChatMessageState,
} from './assistantTextChatMessageState';
import {
  resolveStoredTranscriptMemoryState,
} from './storedTranscriptMemoryState';

function buildStoredTranscriptTransparencyFields(part, partCount, transparency) {
  const normalizedTransparency = normalizeTransparencyData(transparency);
  if (!normalizedTransparency) {
    return {};
  }

  const fields = {};
  const canAttachUserContext = part.sender === 'user' || partCount === 1;
  const systemPrompt = normalizedTransparency.systemPrompt || null;
  const toolSchemas = normalizedTransparency.toolSchemas || null;

  if (canAttachUserContext && (systemPrompt || toolSchemas)) {
    fields.systemPrompt = {
      ...(systemPrompt ? { content: systemPrompt } : {}),
      ...(toolSchemas ? { toolSchemas } : {}),
    };
  }
  if (canAttachUserContext && toolSchemas) {
    fields.toolSchemas = toolSchemas;
  }

  const fullUserContent = normalizedTransparency.fullUserMessage?.content || null;
  const fullUserMetadata = normalizedTransparency.fullUserMessage?.metadata || null;
  if (canAttachUserContext && (fullUserContent || fullUserMetadata)) {
    fields.fullUserMessage = {
      ...(fullUserContent ? { content: fullUserContent } : {}),
      ...(fullUserMetadata ? { metadata: fullUserMetadata } : {}),
    };
  }

  const fullAssistantContent = normalizedTransparency.fullAssistantMessage?.content || null;
  if (part.sender === 'assistant' && fullAssistantContent) {
    fields.fullAssistantMessage = {
      content: fullAssistantContent,
    };
  }

  return fields;
}

function buildStoredTranscriptMessageParts(memory, normalizedMemory) {
  if (!memory) {
    return [];
  }

  const {
    rawContent,
    role,
    messageType,
    modelProvider,
    modelId,
    correlationId,
    structuredToolPayload,
    screenshotAttachment,
  } = normalizedMemory;

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

export function buildStoredTranscriptChatMessages(memory, index) {
  const normalizedMemory = resolveStoredTranscriptMemoryState(memory);
  const parts = buildStoredTranscriptMessageParts(memory, normalizedMemory);
  const transparency = normalizedMemory.transparency;
  const partCount = parts.length;

  return parts.map((part, partIndex) => {
    const messageId = `${memory?.id || index}-${partIndex}`;
    if (part.type === 'tool-call') {
      const transparencyFields = buildStoredTranscriptTransparencyFields(part, partCount, transparency);
      return {
        ...buildToolCallChatMessageState({
          id: messageId,
          text: part.text,
          toolCallDisplayText: part.toolCallDisplayText || null,
          modelFacingToolCall: part.modelFacingToolCall || null,
          toolCallDetails: part.toolCallDetails || null,
          correlationId: part.correlationId || null,
          sourceEventType: part.sourceEventType || null,
          modelId: part.modelId || null,
          modelProvider: part.modelProvider || null,
          isComplete: true,
        }),
        ...transparencyFields,
      };
    }

    if (part.type === 'tool-output') {
      const transparencyFields = buildStoredTranscriptTransparencyFields(part, partCount, transparency);
      return {
        ...buildToolOutputChatMessageState({
          id: messageId,
          outputText: part.text,
          screenshot: part.screenshot || null,
          screenshotRef: part.screenshotRef || null,
          screenshotUrl: part.screenshotUrl || null,
          screenshotContentType: part.screenshotContentType || null,
          correlationId: part.correlationId || null,
          toolOutputDetails: part.toolOutputDetails || null,
          modelFacingToolOutput: part.modelFacingToolOutput || null,
          modelId: part.modelId || null,
          modelProvider: part.modelProvider || null,
          isComplete: true,
          deriveScreenshotUrlFromRef: false,
          preserveNullAttachmentFields: false,
          preserveNullToolMetadata: false,
          preserveNullToolOutputDetails: false,
        }),
        ...transparencyFields,
      };
    }

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
    const transparencyFields = buildStoredTranscriptTransparencyFields(part, partCount, transparency);

    if (part.sender === 'assistant' && part.type === 'llm-text') {
      return {
        ...buildAssistantTextChatMessageState({
          id: messageId,
          text: part.text,
          modelId: part.modelId || null,
          modelProvider: part.modelProvider || null,
          isComplete: true,
        }),
        ...transparencyFields,
      };
    }

    return {
      id: messageId,
      text: part.text,
      sender: part.sender,
      type: part.type,
      ...(part.correlationId ? { correlationId: part.correlationId } : {}),
      ...modelFields,
      ...screenshotFields,
      ...transparencyFields,
      isComplete: true,
    };
  });
}
