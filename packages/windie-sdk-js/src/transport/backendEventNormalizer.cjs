function createRuntimeId(prefix) {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function asPayload(event) {
  return event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? event.payload
    : {};
}

function conversationRefOf(event) {
  if (typeof event?.conversation_ref === 'string' && event.conversation_ref.trim()) {
    return event.conversation_ref.trim();
  }
  return null;
}

function stringFromEventPayloadOrTopLevel(event, key) {
  const payload = asPayload(event);
  if (typeof payload[key] === 'string') {
    return payload[key];
  }
  return typeof event?.[key] === 'string' ? event[key] : null;
}

function revisionIdFor(event, fallbackRevisionId) {
  const payload = asPayload(event);
  if (typeof payload.revision_id === 'string' && payload.revision_id.trim()) {
    return payload.revision_id.trim();
  }
  if (typeof payload.revisionId === 'string' && payload.revisionId.trim()) {
    return payload.revisionId.trim();
  }
  return fallbackRevisionId || createRuntimeId('rev');
}

function eventBase(event, options = {}) {
  const conversationRef = conversationRefOf(event) || options.fallbackConversationRef || null;
  if (!conversationRef) {
    return null;
  }
  return {
    conversationRef,
    revisionId: revisionIdFor(event, options.fallbackRevisionId),
    turnRef: typeof event?.turn_ref === 'string' ? event.turn_ref : null,
    eventId: typeof event?.id === 'string' ? event.id : createRuntimeId('evt'),
    timestamp: new Date().toISOString(),
  };
}

function createConversationEvent({ type, conversationRef, revisionId, turnRef, source = 'backend', payload, eventId, timestamp }) {
  return {
    eventId: eventId || createRuntimeId('evt'),
    type,
    conversationRef,
    turnRef: turnRef ?? null,
    revisionId: revisionId || createRuntimeId('rev'),
    timestamp: timestamp || new Date().toISOString(),
    source,
    payload: payload || {},
  };
}

function resolveModelFacingToolCallId(payload) {
  if (typeof payload.tool_call_id === 'string' && payload.tool_call_id.trim()) {
    return payload.tool_call_id;
  }
  if (typeof payload.openai_tool_call_id === 'string' && payload.openai_tool_call_id.trim()) {
    return payload.openai_tool_call_id;
  }
  if (typeof payload.provider_tool_call_id === 'string' && payload.provider_tool_call_id.trim()) {
    return payload.provider_tool_call_id;
  }
  return null;
}

function normalizeBackendEventToConversationEvent(event, options = {}) {
  const base = eventBase(event, options);
  if (!base) {
    return null;
  }
  const payload = asPayload(event);
  if (event.type === 'query-accepted') {
    return createConversationEvent({
      ...base,
      type: 'turn_started',
      payload: { status: typeof payload.status === 'string' ? payload.status : 'accepted' },
    });
  }
  if (event.type === 'llm-thought') {
    return createConversationEvent({
      ...base,
      type: 'reasoning_delta',
      payload: {
        text: typeof payload.status === 'string'
          ? payload.status
          : (typeof payload.content === 'string' ? payload.content : ''),
      },
    });
  }
  if (event.type === 'streaming-response') {
    return createConversationEvent({
      ...base,
      type: 'assistant_delta',
      payload: { text: typeof payload.text === 'string' ? payload.text : '' },
    });
  }
  if (event.type === 'streaming-complete') {
    return createConversationEvent({
      ...base,
      type: 'turn_completed',
      payload: {
        finalResponse: typeof payload.final_response === 'string' ? payload.final_response : null,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
      },
    });
  }
  if (event.type === 'local-user-message') {
    return createConversationEvent({
      ...base,
      type: 'user_message',
      payload: {
        ...payload,
        text: typeof payload.text === 'string' ? payload.text : '',
        content: typeof payload.text === 'string' ? payload.text : '',
        screenshotRef: typeof payload.screenshot_ref === 'string' ? payload.screenshot_ref : null,
        screenshotUrl: typeof payload.screenshot_url === 'string' ? payload.screenshot_url : null,
        screenshotRefs: Array.isArray(payload.screenshot_refs) ? payload.screenshot_refs : [],
        attachmentFilenames: Array.isArray(payload.attachment_filenames) ? payload.attachment_filenames : [],
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        sourceEventType: 'local-user-message',
        structuredPayload: payload,
      },
    });
  }
  if (event.type === 'system-prompt') {
    const toolSchemas = Array.isArray(payload.tool_schemas) ? payload.tool_schemas : [];
    return createConversationEvent({
      ...base,
      type: 'system_prompt',
      payload: {
        ...payload,
        content: typeof payload.content === 'string' ? payload.content : '',
        toolSchemas,
        structuredPayload: payload,
      },
    });
  }
  if (event.type === 'user-message-full') {
    return createConversationEvent({
      ...base,
      type: 'user_message_metadata',
      payload: {
        ...payload,
        content: typeof payload.content === 'string' ? payload.content : '',
        metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
          ? payload.metadata
          : null,
        structuredPayload: payload,
      },
    });
  }
  if (event.type === 'assistant-message-full') {
    const content = stringFromEventPayloadOrTopLevel(event, 'content');
    return createConversationEvent({
      ...base,
      type: 'assistant_message',
      payload: {
        text: content || '',
        content: content || '',
        structuredPayload: payload,
      },
    });
  }
  if (event.type === 'tool-schemas') {
    const toolSchemas = Array.isArray(payload.tool_schemas) ? payload.tool_schemas : [];
    return createConversationEvent({
      ...base,
      type: 'tool_schemas_metadata',
      payload: { ...payload, toolSchemas, structuredPayload: payload },
    });
  }
  if (event.type === 'tool-call') {
    return createConversationEvent({
      ...base,
      type: 'tool_call',
      payload: {
        toolName: typeof payload.tool_name === 'string' ? payload.tool_name : null,
        args: payload.parameters && typeof payload.parameters === 'object' ? payload.parameters : {},
        requestId: typeof payload.request_id === 'string' ? payload.request_id : null,
        correlationId: typeof payload.correlation_id === 'string' ? payload.correlation_id : null,
        toolCallId: resolveModelFacingToolCallId(payload),
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        structuredPayload: payload,
      },
    });
  }
  if (event.type === 'web-search-progress') {
    return createConversationEvent({
      ...base,
      type: 'tool_progress',
      payload: {
        ...payload,
        toolName: 'web_search',
        text: typeof payload.text === 'string' ? payload.text : '',
        requestId: typeof payload.request_id === 'string' ? payload.request_id : null,
        correlationId: typeof payload.request_id === 'string' ? payload.request_id : null,
        structuredPayload: payload,
      },
    });
  }
  if (event.type === 'tool-output') {
    return createConversationEvent({
      ...base,
      type: 'tool_output',
      payload: {
        ...payload,
        toolName: typeof payload.tool_name === 'string' ? payload.tool_name : null,
        requestId: typeof payload.request_id === 'string' ? payload.request_id : null,
        correlationId: typeof payload.request_id === 'string' ? payload.request_id : null,
        screenshotRef: typeof payload.screenshot_ref === 'string' ? payload.screenshot_ref : null,
        screenshot: typeof payload.screenshot === 'string' ? payload.screenshot : null,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        structuredPayload: payload,
      },
    });
  }
  if (event.type === 'tool-bundle') {
    return createConversationEvent({
      ...base,
      type: 'tool_bundle_call',
      payload: {
        bundleId: typeof payload.bundle_id === 'string' ? payload.bundle_id : null,
        correlationId: typeof payload.bundle_id === 'string' ? payload.bundle_id : null,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
        tools: Array.isArray(payload.tools) ? payload.tools : [],
        structuredPayload: payload,
      },
    });
  }
  if (event.type === 'context-compaction-started') {
    return createConversationEvent({
      ...base,
      type: 'compaction_started',
      payload: { ...payload, reason: typeof payload.reason === 'string' ? payload.reason : null },
    });
  }
  if (event.type === 'context-compaction-completed') {
    const skippedReason = typeof payload.skipped_reason === 'string' ? payload.skipped_reason : '';
    const replacementHistoryEntries = Array.isArray(payload.replacement_history_entries)
      ? payload.replacement_history_entries
      : [];
    const hasReplacementHistory = replacementHistoryEntries.length > 0;
    return createConversationEvent({
      ...base,
      type: skippedReason || !hasReplacementHistory ? 'compaction_skipped' : 'compaction_applied',
      payload: {
        ...payload,
        skippedReason: skippedReason || (hasReplacementHistory ? null : 'missing-replacement-history'),
        generationId: typeof payload.generation_id === 'string' ? payload.generation_id : null,
        reason: typeof payload.reason === 'string' ? payload.reason : null,
        strategy: typeof payload.strategy === 'string' ? payload.strategy : null,
        beforeTokens: typeof payload.before_tokens === 'number' ? payload.before_tokens : null,
        afterTokens: typeof payload.after_tokens === 'number' ? payload.after_tokens : null,
        removedMessages: typeof payload.removed_messages === 'number' ? payload.removed_messages : null,
        summaryPreview: typeof payload.summary_preview === 'string' ? payload.summary_preview : null,
        summaryText: typeof payload.summary_text === 'string' ? payload.summary_text : null,
        replacementHistoryPreview: Array.isArray(payload.replacement_history_preview)
          ? payload.replacement_history_preview
          : [],
        replacementHistoryEntries,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
      },
    });
  }
  if (event.type === 'context-compaction-failed') {
    return createConversationEvent({
      ...base,
      type: 'compaction_failed',
      payload: { ...payload, error: typeof payload.error === 'string' ? payload.error : null },
    });
  }
  if (event.type === 'error') {
    const message = typeof payload.message === 'string'
      ? payload.message
      : (typeof payload.content === 'string' ? payload.content : 'Backend error');
    return createConversationEvent({
      ...base,
      type: 'turn_error',
      payload: {
        message,
        content: typeof payload.content === 'string' ? payload.content : message,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
      },
    });
  }
  if (event.type === 'token-count') {
    return createConversationEvent({
      ...base,
      type: 'usage_updated',
      payload: {
        ...payload,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
      },
    });
  }
  if (event.type === 'memory-store') {
    return createConversationEvent({
      ...base,
      type: 'memory_stored',
      payload: {
        ...payload,
        userId: typeof event.user_id === 'string' ? event.user_id : null,
      },
    });
  }
  return null;
}

module.exports = {
  normalizeBackendEventToConversationEvent,
};
