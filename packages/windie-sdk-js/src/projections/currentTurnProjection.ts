function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function recordFromUnknown(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function outputTextFromRecord(payload) {
  if (!payload) return null;
  return nonEmptyString(payload.llm_content)
    ?? nonEmptyString(payload.output)
    ?? nonEmptyString(payload.model_llm_content)
    ?? nonEmptyString(payload.content)
    ?? nonEmptyString(payload.message)
    ?? nonEmptyString(payload.display_content)
    ?? nonEmptyString(payload.return_display)
    ?? (payload.error ? `Error: ${payload.error}` : null);
}

function bundleStepResultsFromPayload(payload) {
  const structuredPayload = recordFromUnknown(payload.structuredPayload);
  const candidates = [
    payload.stepResults,
    payload.step_results,
    structuredPayload?.stepResults,
    structuredPayload?.step_results,
    structuredPayload?.results,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate
      .map(step => recordFromUnknown(step))
      .filter(Boolean);
  }
  return [];
}

function bundleOutputTextFromPayload(payload) {
  const steps = bundleStepResultsFromPayload(payload);
  if (steps.length === 0) return null;
  return steps.map((step, index) => {
    const outputRecord = recordFromUnknown(step.output) ?? recordFromUnknown(step.result);
    const outputText = outputTextFromRecord(outputRecord)
      ?? nonEmptyString(step.output)
      ?? nonEmptyString(step.result)
      ?? outputTextFromRecord(step)
      ?? JSON.stringify(step);
    const toolName = nonEmptyString(step.toolName) ?? nonEmptyString(step.tool_name) ?? nonEmptyString(step.tool);
    const label = toolName ? `${toolName} #${index + 1}` : `step #${index + 1}`;
    return `${label}\n${outputText}`;
  }).join('\n\n');
}

function textFromPayload(payload) {
  const bundleOutputText = bundleOutputTextFromPayload(payload);
  if (bundleOutputText) return bundleOutputText;
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.content === 'string') return payload.content;
  if (typeof payload.status === 'string') return payload.status;
  if (typeof payload.final_response === 'string') return payload.final_response;
  if (typeof payload.finalResponse === 'string') return payload.finalResponse;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  return '';
}

const SETTINGS_UPDATE_ERROR_TEXT = 'Failed to update settings';
const RECOVERABLE_TOOL_PARSE_ERROR_MARKERS = [
  'failed to parse streamed tool-call arguments',
  'raw arguments preview:',
];

function shouldIgnoreCurrentTurnError(payload) {
  const message = typeof payload.message === 'string' ? payload.message : '';
  const content = typeof payload.content === 'string' ? payload.content : '';
  const normalizedMessage = message.toLowerCase();
  const normalizedContent = content.toLowerCase();
  const isRecoverableToolParseError = RECOVERABLE_TOOL_PARSE_ERROR_MARKERS.every((marker) => (
    normalizedMessage.includes(marker) || normalizedContent.includes(marker)
  ));
  return (
    message.includes(SETTINGS_UPDATE_ERROR_TEXT)
    || content.includes(SETTINGS_UPDATE_ERROR_TEXT)
    || isRecoverableToolParseError
  );
}

function conversationRefFrom(event, fallbackConversationRef) {
  if (typeof event?.conversation_ref === 'string' && event.conversation_ref.trim()) {
    return event.conversation_ref.trim();
  }
  const payload = asRecord(event?.payload);
  if (typeof payload.conversation_ref === 'string' && payload.conversation_ref.trim()) {
    return payload.conversation_ref.trim();
  }
  if (typeof payload.conversationRef === 'string' && payload.conversationRef.trim()) {
    return payload.conversationRef.trim();
  }
  return typeof fallbackConversationRef === 'string' && fallbackConversationRef.trim()
    ? fallbackConversationRef.trim()
    : null;
}

function turnRefFrom(event) {
  if (typeof event?.turn_ref === 'string' && event.turn_ref.trim()) {
    return event.turn_ref.trim();
  }
  const payload = asRecord(event?.payload);
  if (typeof payload.turn_ref === 'string' && payload.turn_ref.trim()) {
    return payload.turn_ref.trim();
  }
  if (typeof payload.turnRef === 'string' && payload.turnRef.trim()) {
    return payload.turnRef.trim();
  }
  return null;
}

function toolNameFromPayload(payload, fallback) {
  if (typeof payload.tool_name === 'string') return payload.tool_name;
  if (typeof payload.toolName === 'string') return payload.toolName;
  return fallback ?? null;
}

function statusFromPayload(payload) {
  if (typeof payload.status === 'string') return payload.status;
  if (typeof payload.success === 'boolean') return payload.success ? 'success' : 'error';
  if (typeof payload.error === 'string' && payload.error) return 'error';
  return null;
}

function createEmptyCurrentTurnProjection(conversationRef = '', turnRef = null) {
  return {
    conversationRef,
    turnRef,
    phase: turnRef ? 'awaiting' : 'idle',
    assistantText: '',
    reasoningText: null,
    toolEvents: [],
    lastError: null,
  };
}

function appendText(current, next) {
  return next ? `${current || ''}${next}` : (current || '');
}

function toolEventFromBackendEvent(event, payload) {
  if (event.type === 'tool-call' || event.type === 'tool-bundle') {
    const fallbackName = event.type === 'tool-bundle' ? 'tool_bundle' : null;
    return {
      id: event.id || payload.request_id || payload.bundle_id || `${event.type}:${Date.now()}`,
      kind: 'tool_call',
      toolName: toolNameFromPayload(payload, fallbackName),
      text: textFromPayload(payload) || undefined,
      status: statusFromPayload(payload),
      payload,
    };
  }
  if (event.type === 'web-search-progress') {
    return {
      id: event.id || payload.request_id || `web-search-progress:${Date.now()}`,
      kind: 'tool_progress',
      toolName: toolNameFromPayload(payload, 'web_search'),
      text: textFromPayload(payload) || undefined,
      status: statusFromPayload(payload),
      payload,
    };
  }
  if (event.type === 'tool-output' || event.type === 'tool-bundle-output') {
    const fallbackName = event.type === 'tool-bundle-output' ? 'tool_bundle' : null;
    return {
      id: event.id || payload.request_id || payload.bundle_id || `${event.type}:${Date.now()}`,
      kind: 'tool_output',
      toolName: toolNameFromPayload(payload, fallbackName),
      text: textFromPayload(payload) || undefined,
      status: statusFromPayload(payload),
      payload,
    };
  }
  return null;
}

function toolEventFromConversationEvent(event, payload) {
  if (event.type === 'tool_call' || event.type === 'tool_bundle_call') {
    const fallbackName = event.type === 'tool_bundle_call' ? 'tool_bundle' : null;
    return {
      id: event.eventId || payload.requestId || payload.bundleId || `${event.type}:${Date.now()}`,
      kind: 'tool_call',
      toolName: toolNameFromPayload(payload, fallbackName),
      text: textFromPayload(payload) || undefined,
      status: statusFromPayload(payload),
      payload,
    };
  }
  if (event.type === 'tool_progress') {
    return {
      id: event.eventId || payload.requestId || `tool_progress:${Date.now()}`,
      kind: 'tool_progress',
      toolName: toolNameFromPayload(payload, 'web_search'),
      text: textFromPayload(payload) || undefined,
      status: statusFromPayload(payload),
      payload,
    };
  }
  if (event.type === 'tool_output' || event.type === 'tool_bundle_output') {
    const fallbackName = event.type === 'tool_bundle_output' ? 'tool_bundle' : null;
    return {
      id: event.eventId || payload.requestId || payload.bundleId || `${event.type}:${Date.now()}`,
      kind: 'tool_output',
      toolName: toolNameFromPayload(payload, fallbackName),
      text: textFromPayload(payload) || undefined,
      status: statusFromPayload(payload),
      payload,
    };
  }
  return null;
}

function updateCurrentTurnProjectionFromConversationEvent(currentProjection, event) {
  const eventRecord = asRecord(event);
  const payload = asRecord(eventRecord.payload);
  const conversationRef = typeof eventRecord.conversationRef === 'string' && eventRecord.conversationRef.trim()
    ? eventRecord.conversationRef.trim()
    : null;
  if (!conversationRef) {
    return null;
  }
  const turnRef = typeof eventRecord.turnRef === 'string' && eventRecord.turnRef.trim()
    ? eventRecord.turnRef.trim()
    : null;
  let projection = currentProjection && currentProjection.conversationRef === conversationRef
    ? currentProjection
    : createEmptyCurrentTurnProjection(conversationRef, turnRef);
  if (turnRef && projection.turnRef !== turnRef) {
    projection = createEmptyCurrentTurnProjection(conversationRef, turnRef);
  } else if (!projection.turnRef && turnRef) {
    projection = { ...projection, turnRef };
  }

  if (eventRecord.type === 'turn_started' || eventRecord.type === 'user_message') {
    return { ...projection, phase: 'awaiting', lastError: null };
  }
  if (eventRecord.type === 'reasoning_delta') {
    return {
      ...projection,
      phase: projection.phase === 'idle' ? 'awaiting' : projection.phase,
      reasoningText: appendText(projection.reasoningText, textFromPayload(payload)) || null,
    };
  }
  if (eventRecord.type === 'assistant_delta') {
    return {
      ...projection,
      phase: 'streaming',
      assistantText: appendText(projection.assistantText, textFromPayload(payload)),
      lastError: null,
    };
  }
  if (eventRecord.type === 'assistant_message') {
    const text = textFromPayload(payload);
    return {
      ...projection,
      phase: text ? 'streaming' : projection.phase,
      assistantText: text || projection.assistantText,
      lastError: null,
    };
  }
  const toolEvent = toolEventFromConversationEvent(eventRecord, payload);
  if (toolEvent) {
    return {
      ...projection,
      phase: toolEvent.kind === 'tool_output' ? 'tool_output' : 'tool_call',
      toolEvents: [...projection.toolEvents, toolEvent],
      lastError: null,
    };
  }
  if (eventRecord.type === 'turn_completed') {
    const finalResponse = textFromPayload(payload);
    return {
      ...projection,
      phase: 'complete',
      assistantText: projection.assistantText || finalResponse,
      lastError: null,
    };
  }
  if (
    eventRecord.type === 'turn_error'
    || eventRecord.type === 'runtime_error'
    || eventRecord.type === 'compaction_failed'
  ) {
    if (eventRecord.type === 'turn_error' && shouldIgnoreCurrentTurnError(payload)) {
      return null;
    }
    return {
      ...projection,
      phase: 'error',
      lastError: textFromPayload(payload) || 'Unknown runtime error',
    };
  }
  return null;
}

function updateCurrentTurnProjectionFromBackendEvent(currentProjection, event, options: any = {}) {
  const eventRecord = asRecord(event);
  const payload = asRecord(eventRecord.payload);
  const conversationRef = conversationRefFrom(eventRecord, options.fallbackConversationRef);
  if (!conversationRef) {
    return null;
  }
  const turnRef = turnRefFrom(eventRecord);
  let projection = currentProjection && currentProjection.conversationRef === conversationRef
    ? currentProjection
    : createEmptyCurrentTurnProjection(conversationRef, turnRef);
  if (turnRef && projection.turnRef !== turnRef) {
    projection = createEmptyCurrentTurnProjection(conversationRef, turnRef);
  } else if (!projection.turnRef && turnRef) {
    projection = { ...projection, turnRef };
  }

  if (eventRecord.type === 'query-accepted' || eventRecord.type === 'local-user-message') {
    return { ...projection, phase: 'awaiting', lastError: null };
  }
  if (eventRecord.type === 'llm-thought') {
    return {
      ...projection,
      phase: projection.phase === 'idle' ? 'awaiting' : projection.phase,
      reasoningText: appendText(projection.reasoningText, textFromPayload(payload)) || null,
    };
  }
  if (eventRecord.type === 'streaming-response') {
    return {
      ...projection,
      phase: 'streaming',
      assistantText: appendText(projection.assistantText, textFromPayload(payload)),
      lastError: null,
    };
  }
  if (eventRecord.type === 'assistant-message-full') {
    const text = textFromPayload(payload);
    return {
      ...projection,
      phase: text ? 'streaming' : projection.phase,
      assistantText: text || projection.assistantText,
      lastError: null,
    };
  }
  const toolEvent = toolEventFromBackendEvent(eventRecord, payload);
  if (toolEvent) {
    return {
      ...projection,
      phase: toolEvent.kind === 'tool_output' ? 'tool_output' : 'tool_call',
      toolEvents: [...projection.toolEvents, toolEvent],
      lastError: null,
    };
  }
  if (eventRecord.type === 'streaming-complete') {
    const finalResponse = textFromPayload(payload);
    return {
      ...projection,
      phase: 'complete',
      assistantText: projection.assistantText || finalResponse,
      lastError: null,
    };
  }
  if (eventRecord.type === 'error' || eventRecord.type === 'context-compaction-failed') {
    if (eventRecord.type === 'error' && shouldIgnoreCurrentTurnError(payload)) {
      return null;
    }
    return {
      ...projection,
      phase: 'error',
      lastError: textFromPayload(payload) || 'Unknown runtime error',
    };
  }
  return null;
}

function createCurrentTurnProjector() {
  const projections = new Map();
  return {
    applyBackendEvent(event, options: any = {}) {
      const conversationRef = conversationRefFrom(event, options.fallbackConversationRef);
      if (!conversationRef) {
        return null;
      }
      const next = updateCurrentTurnProjectionFromBackendEvent(
        projections.get(conversationRef),
        event,
        options,
      );
      if (!next) {
        return null;
      }
      projections.set(next.conversationRef, next);
      return next;
    },
    get(conversationRef) {
      return projections.get(conversationRef) || null;
    },
    reset(conversationRef) {
      if (conversationRef) {
        projections.delete(conversationRef);
      } else {
        projections.clear();
      }
    },
  };
}

function createConversationEventCurrentTurnProjector() {
  const projections = new Map();
  return {
    applyConversationEvent(event) {
      const conversationRef = typeof event?.conversationRef === 'string' && event.conversationRef.trim()
        ? event.conversationRef.trim()
        : null;
      if (!conversationRef) {
        return null;
      }
      const next = updateCurrentTurnProjectionFromConversationEvent(
        projections.get(conversationRef),
        event,
      );
      if (!next) {
        return null;
      }
      projections.set(next.conversationRef, next);
      return next;
    },
    get(conversationRef) {
      return projections.get(conversationRef) || null;
    },
    reset(conversationRef) {
      if (conversationRef) {
        projections.delete(conversationRef);
      } else {
        projections.clear();
      }
    },
  };
}

export {
  createConversationEventCurrentTurnProjector,
  createCurrentTurnProjector,
  createEmptyCurrentTurnProjection,
  updateCurrentTurnProjectionFromConversationEvent,
  updateCurrentTurnProjectionFromBackendEvent,
};
