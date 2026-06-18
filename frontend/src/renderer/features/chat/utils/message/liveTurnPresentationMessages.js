/**
 * Provides live current-turn presentation message projection for renderer UI.
 */

import {
  buildToolBundleMessageState,
  buildToolCallChatMessageState,
  buildToolCallMessageState,
} from '../../../../app/runtime/desktopChatMessageRuntimeClient';
import { buildToolOutputEnvelopeMessage } from '../toolOutputMessages';
import { SDK_CURRENT_TURN_SOURCE_CHANNEL } from './sourceChannels';

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
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

function buildBaseMessageFields(entry, currentTurnProjection) {
  return {
    id: entry.id,
    sourceEventType: entry.sourceEventType || null,
    sourceChannel: entry.sourceChannel || SDK_CURRENT_TURN_SOURCE_CHANNEL,
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
  return {
    ...buildToolOutputEnvelopeMessage({
      outputText: text,
      sourceEventType: entry.sourceEventType || 'tool_output',
      sourceChannel: entry.sourceChannel || SDK_CURRENT_TURN_SOURCE_CHANNEL,
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
      modelContext: {
        modelId: entry.modelId || null,
        modelProvider: entry.modelProvider || null,
      },
    }),
    id: entry.id,
    isComplete: entry.isComplete === true,
  };
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
