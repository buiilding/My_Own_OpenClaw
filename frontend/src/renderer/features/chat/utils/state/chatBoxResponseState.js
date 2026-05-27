import { resolveSourceTag } from '../message/sourceTags';
import { buildCurrentTurnResponseOverlayEntries as buildCurrentTurnResponseOverlayEntriesFromPipeline } from '../message/messagePresentationPipeline';
import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../../../infrastructure/transcript/toolCallMessageState';
import { buildToolCallChatMessageState } from '../../../../infrastructure/transcript/toolCallChatMessageState';
import { buildToolOutputEnvelopeMessage } from '../toolOutputMessages';
import {
  buildScreenshotAttachment,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
} from '../chatStream/chatStreamEventUtils';

export function buildCurrentTurnResponseOverlayEntries(messages) {
  return buildCurrentTurnResponseOverlayEntriesFromPipeline(messages);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function readString(value) {
  return typeof value === 'string' ? value : null;
}

function readArray(value) {
  return Array.isArray(value) ? value : null;
}

function resolveToolPayload(toolEvent) {
  return asObject(toolEvent?.payload) || {};
}

function buildProjectedToolCallMessage({
  baseId,
  turnRef,
  toolEvent,
  payload,
}) {
  const structuredPayload = asObject(payload.structuredPayload);
  const toolCallDetails = structuredPayload || payload;
  const metadata = asObject(toolCallDetails.metadata);
  const args = asObject(payload.args) || asObject(payload.parameters) || asObject(toolCallDetails.parameters);
  const toolName = readString(payload.toolName) || readString(payload.tool_name) || toolEvent.toolName || '';
  const requestId = readString(payload.requestId) || readString(payload.request_id);
  const correlationId = (
    readString(payload.correlationId)
    || readString(payload.correlation_id)
    || resolveToolCallCorrelationId(toolCallDetails)
  );

  if (toolName === 'tool_bundle' || readArray(toolCallDetails.tools)) {
    const bundleState = buildToolBundleMessageState(toolCallDetails);
    return buildToolCallChatMessageState({
      id: `${baseId}:tool:${toolEvent.id}`,
      text: bundleState.text,
      toolCallDisplayText: bundleState.toolCallDisplayText,
      toolCallDetails: bundleState.toolCallDetails ?? null,
      correlationId: bundleState.correlationId ?? null,
      sourceEventType: toolEvent.kind,
      sourceChannel: 'conversation-runtime-updated',
      turnRef: turnRef || undefined,
    });
  }

  const toolCallState = buildToolCallMessageState({
    rawToolCall: asObject(metadata?.model_facing_tool_call),
    fallbackToolName: toolName || null,
    fallbackToolCallId: requestId,
    fallbackArguments: args,
    metadata,
    toolCallDetails,
    correlationId,
  });

  return buildToolCallChatMessageState({
    id: `${baseId}:tool:${toolEvent.id}`,
    text: toolCallState.text,
    toolCallDisplayText: toolCallState.toolCallDisplayText,
    modelFacingToolCall: toolCallState.modelFacingToolCall ?? null,
    toolCallDetails: toolCallState.toolCallDetails ?? null,
    correlationId: toolCallState.correlationId ?? null,
    sourceEventType: toolEvent.kind,
    sourceChannel: 'conversation-runtime-updated',
    turnRef: turnRef || undefined,
  });
}

function formatProjectedToolOutputText(payload) {
  if (typeof payload.display_content === 'string' && payload.display_content.length > 0) {
    return payload.display_content;
  }
  if (typeof payload.output === 'string' && payload.output.length > 0) {
    return payload.output;
  }
  if (payload.error) {
    return `Error: ${payload.error}`;
  }
  return 'No output';
}

function buildProjectedToolOutputMessage({
  baseId,
  turnRef,
  toolEvent,
  payload,
}) {
  const structuredPayload = asObject(payload.structuredPayload);
  const toolOutputDetails = structuredPayload || payload;
  const screenshot = readString(payload.screenshot) || readString(toolOutputDetails.screenshot);
  const screenshotRefValue = readString(payload.screenshotRef) || readString(toolOutputDetails.screenshot_ref);
  const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(screenshotRefValue);
  const requestId = readString(payload.requestId) || readString(toolOutputDetails.request_id);
  const correlationId = (
    readString(payload.correlationId)
    || readString(payload.correlation_id)
    || resolveToolOutputCorrelationId(toolOutputDetails, toolEvent.id)
    || requestId
    || undefined
  );
  return {
    ...buildToolOutputEnvelopeMessage({
      outputText: toolEvent.text || formatProjectedToolOutputText(toolOutputDetails),
      sourceEventType: toolEvent.kind,
      sourceChannel: 'conversation-runtime-updated',
      screenshot: screenshotRef ? null : screenshot,
      screenshotRef,
      screenshotUrl,
      toolMetadata: asObject(toolOutputDetails.metadata),
      toolName: toolEvent.toolName || readString(payload.toolName) || readString(toolOutputDetails.tool_name),
      executionTime: typeof toolOutputDetails.execution_time === 'number' ? toolOutputDetails.execution_time : null,
      success: typeof toolOutputDetails.success === 'boolean' ? toolOutputDetails.success : null,
      correlationId,
      toolOutputDetails,
      turnRef: turnRef || null,
      modelContext: { modelId: null, modelProvider: null },
    }),
    id: `${baseId}:tool:${toolEvent.id}`,
  };
}

function buildProjectedToolProgressMessage({
  baseId,
  turnRef,
  toolEvent,
}) {
  const text = typeof toolEvent?.text === 'string' && toolEvent.text.trim()
    ? toolEvent.text
    : (typeof toolEvent?.toolName === 'string' ? toolEvent.toolName : '');
  if (!text) {
    return null;
  }
  return {
    id: `${baseId}:tool:${toolEvent.id}`,
    text,
    sender: 'assistant',
    type: 'search-source',
    sourceEventType: toolEvent.kind,
    sourceChannel: 'conversation-runtime-updated',
    turnRef: turnRef || undefined,
    toolName: toolEvent.toolName || undefined,
    success: toolEvent.status === 'success' ? true : undefined,
    toolMetadata: toolEvent.payload || null,
  };
}

function buildProjectedToolMessage({ baseId, turnRef, toolEvent }) {
  const payload = resolveToolPayload(toolEvent);
  if (toolEvent.kind === 'tool_output') {
    return buildProjectedToolOutputMessage({ baseId, turnRef, toolEvent, payload });
  }
  if (toolEvent.kind === 'tool_progress') {
    return buildProjectedToolProgressMessage({ baseId, turnRef, toolEvent });
  }
  return buildProjectedToolCallMessage({ baseId, turnRef, toolEvent, payload });
}

export function buildCurrentTurnMessagesFromProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return [];
  }
  const {
    conversationRef,
    turnRef,
    phase,
    assistantText,
    reasoningText,
    toolEvents,
    lastError,
  } = currentTurnProjection;
  const hasText = typeof assistantText === 'string' && assistantText.trim();
  const hasReasoning = typeof reasoningText === 'string' && reasoningText.trim();
  const hasError = typeof lastError === 'string' && lastError.trim();
  const hasToolEvents = Array.isArray(toolEvents) && toolEvents.length > 0;
  if (phase === 'idle' && !hasText && !hasReasoning && !hasError && !hasToolEvents) {
    return [];
  }

  const baseId = `${conversationRef || 'conversation'}:${turnRef || 'turn'}`;
  const messages = [{
    id: `${baseId}:user-marker`,
    text: '',
    sender: 'user',
    turnRef: turnRef || undefined,
    sourceEventType: 'sdk-current-turn',
    sourceChannel: 'conversation-runtime-updated',
  }];

  if (hasReasoning && !hasText) {
    messages.push({
      id: `${baseId}:thinking`,
      text: '',
      sender: 'assistant',
      type: 'llm-text',
      thinkingText: reasoningText,
      sourceEventType: 'reasoning_delta',
      sourceChannel: 'conversation-runtime-updated',
      turnRef: turnRef || undefined,
      isComplete: false,
    });
  }

  if (hasToolEvents) {
    toolEvents.forEach((toolEvent, index) => {
      const projectedToolEvent = {
        ...toolEvent,
        id: toolEvent.id || index,
      };
      const message = buildProjectedToolMessage({ baseId, turnRef, toolEvent: projectedToolEvent });
      if (message) {
        messages.push(message);
      }
    });
  }

  if (hasText) {
    messages.push({
      id: `${baseId}:assistant`,
      text: assistantText,
      sender: 'assistant',
      type: 'llm-text',
      thinkingText: hasReasoning ? reasoningText : null,
      sourceEventType: 'assistant_delta',
      sourceChannel: 'conversation-runtime-updated',
      turnRef: turnRef || undefined,
      isComplete: phase === 'complete',
    });
  }

  if (hasError) {
    messages.push({
      id: `${baseId}:error`,
      text: lastError,
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'runtime_error',
      sourceChannel: 'conversation-runtime-updated',
      turnRef: turnRef || undefined,
      isComplete: true,
    });
  }

  return messages;
}

function isActiveCurrentTurnProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return false;
  }
  if (currentTurnProjection.phase && currentTurnProjection.phase !== 'idle') {
    return true;
  }
  return Boolean(
    currentTurnProjection.assistantText
    || currentTurnProjection.reasoningText
    || currentTurnProjection.lastError
    || currentTurnProjection.toolEvents?.length,
  );
}

function findCurrentTurnUserAnchor(messages, currentTurnProjection) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return -1;
  }
  const turnRef = currentTurnProjection?.turnRef;
  if (typeof turnRef === 'string' && turnRef) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.sender === 'user' && messages[index]?.turnRef === turnRef) {
        return index;
      }
    }
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.sender === 'user') {
      return index;
    }
  }
  return -1;
}

export function replaceCurrentTurnMessagesWithProjection(messages, currentTurnProjection) {
  if (!isActiveCurrentTurnProjection(currentTurnProjection)) {
    return messages;
  }
  const projectedAssistantMessages = buildCurrentTurnMessagesFromProjection(currentTurnProjection)
    .filter((message) => message?.sender !== 'user');
  if (projectedAssistantMessages.length === 0) {
    return messages;
  }
  const sourceMessages = Array.isArray(messages) ? messages : [];
  const anchorIndex = findCurrentTurnUserAnchor(sourceMessages, currentTurnProjection);
  if (anchorIndex === -1) {
    return projectedAssistantMessages;
  }
  const turnRef = currentTurnProjection?.turnRef;
  const projectedIds = new Set(projectedAssistantMessages.map((message) => message.id).filter(Boolean));
  const nextTail = sourceMessages.slice(anchorIndex + 1).filter((message) => {
    if (projectedIds.has(message?.id)) {
      return false;
    }
    return (
      message?.sender !== 'assistant'
      || (turnRef && message.turnRef && message.turnRef !== turnRef)
    );
  });
  return [
    ...sourceMessages.slice(0, anchorIndex + 1),
    ...projectedAssistantMessages,
    ...nextTail,
  ];
}

export function isResponseCloseable(response) {
  if (!response) {
    return false;
  }
  if (response.type === 'error') {
    return true;
  }
  return Boolean(response.isComplete);
}

export function normalizeThinkingText(thinkingStatus) {
  return typeof thinkingStatus === 'string' ? thinkingStatus.trim() : '';
}

export function shouldRenderResponseMarkdown(response) {
  return Boolean(response && response.type === 'llm-text');
}

export function resolveSourceTagForResponse({
  visibleResponse,
  showResponse,
  devUiEnabled,
}) {
  if (!devUiEnabled || !visibleResponse || !showResponse) {
    return null;
  }
  const sourceEventType = (
    typeof visibleResponse.sourceEventType === 'string' && visibleResponse.sourceEventType
      ? visibleResponse.sourceEventType
      : 'unknown'
  );
  const sourceChannel = (
    typeof visibleResponse.sourceChannel === 'string' && visibleResponse.sourceChannel
      ? visibleResponse.sourceChannel
      : 'unknown'
  );
  return resolveSourceTag(sourceEventType, sourceChannel);
}
