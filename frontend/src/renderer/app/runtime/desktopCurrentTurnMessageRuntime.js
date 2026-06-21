/**
 * Projects SDK current-turn state into renderer chat message rows.
 */

import { DesktopArtifactRuntimeClient } from './desktopArtifactRuntimeClient';
import {
  buildToolBundleMessageState,
  buildToolCallChatMessageState,
  buildToolCallMessageState,
  buildToolOutputChatMessageState,
} from './desktopChatMessageRuntimeClient';
import { DesktopPresentationSourceChannels } from './desktopPresentationSourceChannels';

const sdkCurrentTurnSourceChannel = DesktopPresentationSourceChannels.getSdkCurrentTurnSourceChannel();

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}

function readString(value) {
  return typeof value === 'string' ? value : null;
}

function readArray(value) {
  return Array.isArray(value) ? value : null;
}

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value : '';
}

function normalizeOptionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeEntryType(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'llm-text';
}

function buildProjectedToolCallMessage({
  baseId,
  turnRef,
  toolEvent,
}) {
  const toolCallDetails = asObject(toolEvent.toolCallDetails);
  const metadata = asObject(toolEvent.toolDisplayMetadata) || asObject(toolEvent.toolMetadata);
  const args = asObject(toolEvent.toolArguments);
  const toolName = readString(toolEvent.toolName) || '';
  const requestId = readString(toolEvent.requestId);
  const correlationId = readString(toolEvent.correlationId);

  if (toolName === 'tool_bundle' || readArray(toolEvent.toolCalls) || readArray(toolCallDetails?.tools)) {
    const bundlePayload = {
      ...(toolCallDetails || {}),
      toolCalls: readArray(toolEvent.toolCalls),
      tools: readArray(toolCallDetails?.tools),
    };
    const bundleState = buildToolBundleMessageState(bundlePayload);
    return buildToolCallChatMessageState({
      id: `${baseId}:tool:${toolEvent.id}`,
      text: bundleState.text,
      toolCallDisplayText: bundleState.toolCallDisplayText,
      toolCallDetails: bundleState.toolCallDetails ?? null,
      correlationId: bundleState.correlationId ?? null,
      sourceEventType: toolEvent.kind,
      sourceChannel: sdkCurrentTurnSourceChannel,
      turnRef: turnRef || undefined,
    });
  }

  const toolCallState = buildToolCallMessageState({
    rawToolCall: asObject(toolEvent.modelFacingToolCall),
    fallbackToolName: toolName || null,
    fallbackToolCallId: requestId,
    fallbackArguments: args,
    metadata,
    toolCallValidationFailed: toolEvent.toolCallValidationFailed === true,
    rawToolCallPreview: readString(toolEvent.rawToolCallPreview),
    rawArgumentsPreview: readString(toolEvent.rawArgumentsPreview),
    parseError: readString(toolEvent.parseError),
    executionSkipped: toolEvent.executionSkipped === true,
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
    sourceChannel: sdkCurrentTurnSourceChannel,
    turnRef: turnRef || undefined,
  });
}

function formatProjectedToolOutputText(payload) {
  const bundleSteps = [
    payload.stepResults,
    payload.step_results,
    payload.results,
  ].find(Array.isArray);
  if (Array.isArray(bundleSteps) && bundleSteps.length > 0) {
    return bundleSteps
      .map((step, index) => {
        const stepRecord = asObject(step) || {};
        const outputRecord = asObject(stepRecord.output) || asObject(stepRecord.result) || {};
        const outputText = readString(outputRecord.output)
          || readString(outputRecord.content)
          || readString(outputRecord.message)
          || readString(stepRecord.output)
          || readString(stepRecord.result)
          || readString(stepRecord.error)
          || JSON.stringify(stepRecord, null, 2);
        const toolName = readString(stepRecord.toolName) || readString(stepRecord.tool_name) || readString(stepRecord.tool);
        return `${toolName || 'step'} #${index + 1}\n${outputText}`;
      })
      .join('\n\n');
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
}) {
  const toolOutputDetails = asObject(toolEvent.toolOutputDetails) || {};
  const screenshot = readString(toolEvent.screenshot);
  const screenshotRefValue = readString(toolEvent.screenshotRef);
  const screenshotAttachment = DesktopArtifactRuntimeClient.buildRemoteScreenshotAttachment(screenshotRefValue);
  const screenshotRef = screenshotAttachment.screenshotRef;
  const screenshotUrl = readString(toolEvent.screenshotUrl) || screenshotAttachment.screenshotUrl;
  const requestId = readString(toolEvent.requestId);
  const correlationId = (
    readString(toolEvent.correlationId)
    || requestId
    || undefined
  );
  return buildToolOutputChatMessageState({
    id: `${baseId}:tool:${toolEvent.id}`,
    outputText: toolEvent.text || formatProjectedToolOutputText(toolOutputDetails),
    sourceEventType: toolEvent.kind,
    sourceChannel: sdkCurrentTurnSourceChannel,
    screenshot: screenshotRef ? null : screenshot,
    screenshotRef,
    screenshotUrl,
    screenshotContentType: readString(toolEvent.screenshotContentType),
    toolMetadata: asObject(toolEvent.toolMetadata),
    toolName: readString(toolEvent.toolName),
    executionTime: typeof toolEvent.executionTime === 'number' ? toolEvent.executionTime : null,
    success: typeof toolEvent.success === 'boolean' ? toolEvent.success : null,
    correlationId,
    toolOutputDetails,
    turnRef: turnRef || null,
    modelId: null,
    modelProvider: null,
  });
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
    sourceChannel: sdkCurrentTurnSourceChannel,
    turnRef: turnRef || undefined,
    toolName: toolEvent.toolName || undefined,
    success: toolEvent.status === 'success' ? true : undefined,
    toolMetadata: toolEvent.toolMetadata || null,
  };
}

function buildProjectedToolMessage({ baseId, turnRef, toolEvent }) {
  if (toolEvent.kind === 'tool_output') {
    return buildProjectedToolOutputMessage({ baseId, turnRef, toolEvent });
  }
  if (toolEvent.kind === 'tool_progress') {
    return buildProjectedToolProgressMessage({ baseId, turnRef, toolEvent });
  }
  return buildProjectedToolCallMessage({ baseId, turnRef, toolEvent });
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
    sourceChannel: sdkCurrentTurnSourceChannel,
  }];

  if (hasReasoning && !hasText) {
    messages.push({
      id: `${baseId}:thinking`,
      text: '',
      sender: 'assistant',
      type: 'llm-text',
      thinkingText: reasoningText,
      sourceEventType: 'reasoning_delta',
      sourceChannel: sdkCurrentTurnSourceChannel,
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
      sourceChannel: sdkCurrentTurnSourceChannel,
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
      sourceChannel: sdkCurrentTurnSourceChannel,
      turnRef: turnRef || undefined,
      isComplete: true,
    });
  }

  return messages;
}

function buildBaseMessageFields(entry, currentTurnProjection) {
  return {
    id: entry.id,
    sourceEventType: entry.sourceEventType || null,
    sourceChannel: entry.sourceChannel || sdkCurrentTurnSourceChannel,
    turnRef: entry.turnRef || currentTurnProjection?.turnRef || undefined,
    modelId: entry.modelId || null,
    modelProvider: entry.modelProvider || null,
    isComplete: entry.isComplete === true,
  };
}

function buildThinkingMessage(entry, currentTurnProjection) {
  const thinkingText = normalizeText(entry.text);
  if (!thinkingText) {
    return null;
  }
  return {
    ...buildBaseMessageFields(entry, currentTurnProjection),
    text: '',
    sender: 'assistant',
    type: 'llm-text',
    thinkingText,
    thinkingSourceEventType: entry.sourceEventType || 'reasoning_delta',
    isComplete: false,
  };
}

function buildAssistantTextMessage(entry, currentTurnProjection) {
  const text = normalizeText(entry.text);
  if (!text) {
    return null;
  }
  return {
    ...buildBaseMessageFields(entry, currentTurnProjection),
    text,
    sender: 'assistant',
    type: 'llm-text',
  };
}

function buildErrorMessage(entry, currentTurnProjection) {
  const text = normalizeText(entry.text);
  if (!text) {
    return null;
  }
  return {
    ...buildBaseMessageFields(entry, currentTurnProjection),
    text,
    sender: 'assistant',
    type: 'error',
    isComplete: true,
  };
}

function buildToolCallMessage(entry, currentTurnProjection) {
  const toolName = normalizeOptionalText(entry.toolName);
  const text = normalizeText(entry.text) || (toolName ? `Using ${toolName}` : 'Using tool');
  const toolDetails = asRecord(entry.toolCallDetails);
  if (toolName === 'tool_bundle' || Array.isArray(entry.toolCalls) || Array.isArray(toolDetails?.tools)) {
    const bundlePayload = {
      ...(toolDetails || {}),
      toolCalls: Array.isArray(entry.toolCalls) ? entry.toolCalls : null,
      tools: Array.isArray(toolDetails?.tools) ? toolDetails.tools : null,
    };
    const bundleState = buildToolBundleMessageState(bundlePayload);
    return buildToolCallChatMessageState({
      ...buildBaseMessageFields(entry, currentTurnProjection),
      text: bundleState.text || text,
      toolCallDisplayText: bundleState.toolCallDisplayText || text,
      toolCallDetails: bundleState.toolCallDetails ?? toolDetails,
      correlationId: bundleState.correlationId ?? null,
    });
  }

  const args = asRecord(entry.toolArguments) || null;
  const metadata = asRecord(entry.toolDisplayMetadata) || asRecord(entry.toolMetadata);
  const toolCallState = buildToolCallMessageState({
    rawToolCall: asRecord(entry.modelFacingToolCall),
    fallbackToolName: toolName,
    fallbackToolCallId: normalizeOptionalText(entry.requestId)
      || entry.id,
    fallbackArguments: args,
    metadata,
    toolCallValidationFailed: entry.toolCallValidationFailed === true,
    rawToolCallPreview: normalizeOptionalText(entry.rawToolCallPreview),
    rawArgumentsPreview: normalizeOptionalText(entry.rawArgumentsPreview),
    parseError: normalizeOptionalText(entry.parseError),
    executionSkipped: entry.executionSkipped === true,
    toolCallDetails: toolDetails,
    correlationId: normalizeOptionalText(entry.correlationId),
  });

  return buildToolCallChatMessageState({
    ...buildBaseMessageFields(entry, currentTurnProjection),
    text: toolCallState.text || text,
    toolCallDisplayText: toolCallState.toolCallDisplayText || text,
    modelFacingToolCall: toolCallState.modelFacingToolCall ?? null,
    toolCallDetails: toolCallState.toolCallDetails ?? toolDetails,
    correlationId: toolCallState.correlationId ?? null,
  });
}

function buildToolProgressMessage(entry, currentTurnProjection) {
  const text = normalizeText(entry.text) || normalizeOptionalText(entry.toolName);
  if (!text) {
    return null;
  }
  return {
    ...buildBaseMessageFields(entry, currentTurnProjection),
    text,
    sender: 'assistant',
    type: 'search-source',
    toolName: entry.toolName || undefined,
    toolMetadata: entry.toolMetadata || null,
  };
}

function buildToolOutputMessage(entry, currentTurnProjection) {
  const toolDetails = asRecord(entry.toolOutputDetails);
  const toolName = normalizeOptionalText(entry.toolName);
  const text = normalizeText(entry.text) || (toolName ? `${toolName} completed` : 'Tool completed');
  return buildToolOutputChatMessageState({
    id: entry.id,
    outputText: text,
    sourceEventType: entry.sourceEventType || 'tool_output',
    sourceChannel: entry.sourceChannel || sdkCurrentTurnSourceChannel,
    screenshot: normalizeOptionalText(entry.screenshot),
    screenshotRef: normalizeOptionalText(entry.screenshotRef),
    screenshotUrl: normalizeOptionalText(entry.screenshotUrl),
    screenshotContentType: normalizeOptionalText(entry.screenshotContentType),
    toolMetadata: asRecord(entry.toolMetadata),
    toolName,
    executionTime: typeof entry.executionTime === 'number' ? entry.executionTime : null,
    success: typeof entry.success === 'boolean' ? entry.success : null,
    correlationId: normalizeOptionalText(entry.correlationId),
    toolOutputDetails: toolDetails,
    turnRef: entry.turnRef || currentTurnProjection?.turnRef || null,
    modelId: entry.modelId || null,
    modelProvider: entry.modelProvider || null,
    isComplete: entry.isComplete === true,
  });
}

function buildChatMessageFromLiveTurnEntry(entry, currentTurnProjection = null) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') {
    return null;
  }
  const type = normalizeEntryType(entry.type);
  if (type === 'thinking') {
    return buildThinkingMessage(entry, currentTurnProjection);
  }
  if (type === 'tool-call' || type === 'tool-explanation') {
    return buildToolCallMessage(entry, currentTurnProjection);
  }
  if (type === 'tool-progress' || type === 'search-source') {
    return buildToolProgressMessage(entry, currentTurnProjection);
  }
  if (type === 'tool-output') {
    return buildToolOutputMessage(entry, currentTurnProjection);
  }
  if (type === 'error') {
    return buildErrorMessage(entry, currentTurnProjection);
  }
  return buildAssistantTextMessage(entry, currentTurnProjection);
}

export function buildCurrentTurnMessagesFromPresentation(currentTurnProjection = null) {
  const entries = Array.isArray(currentTurnProjection?.presentation?.entries)
    ? currentTurnProjection.presentation.entries
    : [];
  if (entries.length === 0) {
    return [];
  }
  return entries
    .map((entry) => buildChatMessageFromLiveTurnEntry(entry, currentTurnProjection))
    .filter(Boolean);
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

const RESPONSE_OVERLAY_VISIBLE_MESSAGE_TYPES = new Set([
  'tool-call',
  'tool-output',
  'search-source',
  'tool-explanation',
  'error',
]);

const RESPONSE_OVERLAY_PROGRESS_MESSAGE_TYPES = new Set([
  'tool-call',
  'tool-output',
  'search-source',
  'tool-explanation',
]);

export function isVisibleResponseOverlayMessage(message) {
  return Boolean(
    message
    && message.sender === 'assistant'
    && (
      normalizeText(message.text)
      || normalizeText(message.thinkingText)
      || RESPONSE_OVERLAY_VISIBLE_MESSAGE_TYPES.has(message.type)
    )
  );
}

export function isResponseOverlayProgressMessage(message) {
  return Boolean(
    message
    && RESPONSE_OVERLAY_PROGRESS_MESSAGE_TYPES.has(message.type),
  );
}

export function isResponseOverlaySourceTaggedMessage(message) {
  return Boolean(
    message
    && (
      message.type === 'llm-text'
      || message.type === 'error'
      || normalizeOptionalText(message.sourceEventType)
    ),
  );
}

export function normalizeThinkingText(thinkingStatus) {
  return typeof thinkingStatus === 'string' ? thinkingStatus.trim() : '';
}
