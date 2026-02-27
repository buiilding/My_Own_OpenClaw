export const DEFAULT_USER_ID = 'default_user';

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
    const shouldAttachScreenshot = sender === 'user' || normalizedType === 'tool-output';
    return [{
      sender,
      text: rawContent || '(empty)',
      type: normalizedType,
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
  const rawTransparency = (
    metadata.transparency
    && typeof metadata.transparency === 'object'
    && !Array.isArray(metadata.transparency)
  ) ? metadata.transparency : null;
  if (!rawTransparency) {
    return null;
  }

  const transparency = {};
  const systemPrompt = normalizeOptionalString(rawTransparency.systemPrompt);
  if (systemPrompt) {
    transparency.systemPrompt = systemPrompt;
  }
  if (Array.isArray(rawTransparency.toolSchemas) && rawTransparency.toolSchemas.length > 0) {
    transparency.toolSchemas = rawTransparency.toolSchemas;
  }
  const fullUserContent = normalizeOptionalString(rawTransparency?.fullUserMessage?.content);
  const fullUserMetadata = (
    rawTransparency?.fullUserMessage?.metadata
    && typeof rawTransparency.fullUserMessage.metadata === 'object'
    && !Array.isArray(rawTransparency.fullUserMessage.metadata)
  ) ? rawTransparency.fullUserMessage.metadata : null;
  if (fullUserContent || fullUserMetadata) {
    transparency.fullUserMessage = {
      content: fullUserContent || undefined,
      metadata: fullUserMetadata || undefined,
    };
  }
  const fullAssistantContent = normalizeOptionalString(rawTransparency?.fullAssistantMessage?.content);
  if (fullAssistantContent) {
    transparency.fullAssistantMessage = {
      content: fullAssistantContent,
    };
  }

  return Object.keys(transparency).length > 0 ? transparency : null;
}

function appendTransparencyForRehydrate(content, transparency) {
  if (!transparency || typeof transparency !== 'object') {
    return content;
  }

  const sections = [];
  if (typeof transparency.systemPrompt === 'string' && transparency.systemPrompt.trim()) {
    sections.push(`[Saved System Prompt]\n${transparency.systemPrompt.trim()}`);
  }
  if (Array.isArray(transparency.toolSchemas) && transparency.toolSchemas.length > 0) {
    try {
      sections.push(`[Saved Tool Schemas]\n${JSON.stringify(transparency.toolSchemas)}`);
    } catch (_error) {
      // Ignore non-serializable schema data for rehydrate augmentation.
    }
  }
  const fullUserContent = normalizeOptionalString(transparency?.fullUserMessage?.content);
  if (fullUserContent) {
    sections.push(`[Saved Full User Message]\n${fullUserContent}`);
  }
  if (
    transparency?.fullUserMessage?.metadata
    && typeof transparency.fullUserMessage.metadata === 'object'
    && !Array.isArray(transparency.fullUserMessage.metadata)
  ) {
    try {
      sections.push(`[Saved Full User Metadata]\n${JSON.stringify(transparency.fullUserMessage.metadata)}`);
    } catch (_error) {
      // Ignore non-serializable metadata for rehydrate augmentation.
    }
  }
  const fullAssistantContent = normalizeOptionalString(transparency?.fullAssistantMessage?.content);
  if (fullAssistantContent) {
    sections.push(`[Saved Full Assistant Message]\n${fullAssistantContent}`);
  }

  if (sections.length === 0) {
    return content;
  }
  const baseContent = typeof content === 'string' ? content : '';
  return `${baseContent}\n\n${sections.join('\n\n')}`.trim();
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
      const modelFields = {};
      if (part.modelProvider) {
        modelFields.modelProvider = part.modelProvider;
      }
      if (part.modelId) {
        modelFields.modelId = part.modelId;
      }

      return {
        id: `${memory.id || index}-${partIndex}`,
        text: part.text,
        sender: part.sender,
        type: part.type,
        ...modelFields,
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
  const transparency = resolveTranscriptTransparency(memory);

  return {
    role,
    content: appendTransparencyForRehydrate(memory?.content || '', transparency),
    message_type: messageType,
    tool_name: memory?.tool_name || metadata?.tool_name || null,
    correlation_id: memory?.correlation_id || metadata?.correlation_id || null,
    timestamp: memory?.timestamp || null,
    screenshot_ref: screenshotRef,
    screenshot: screenshotInline ? rawScreenshot : null,
  };
}
