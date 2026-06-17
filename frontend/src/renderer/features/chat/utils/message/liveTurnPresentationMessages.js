/**
 * Provides live current-turn presentation message projection for renderer UI.
 */

import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../../../infrastructure/transcript/toolCallMessageState';
import { buildToolCallChatMessageState } from '../../../../infrastructure/transcript/toolCallChatMessageState';
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
  const payload = asRecord(entry.payload) || {};
  const toolName = normalizeOptionalText(entry.toolName)
    || normalizeOptionalText(payload.toolName)
    || normalizeOptionalText(payload.tool_name);
  const text = normalizeText(entry.text) || (toolName ? `Using ${toolName}` : 'Using tool');
  const toolDetails = asRecord(payload.structuredPayload) || payload;
  if (toolName === 'tool_bundle' || Array.isArray(toolDetails.tools)) {
    const bundleState = buildToolBundleMessageState(toolDetails);
    return buildToolCallChatMessageState({
      ...buildBaseMessageFields(entry, currentTurnProjection),
      text: bundleState.text || text,
      toolCallDisplayText: bundleState.toolCallDisplayText || text,
      toolCallDetails: bundleState.toolCallDetails ?? toolDetails,
      correlationId: bundleState.correlationId ?? null,
    });
  }

  const args = asRecord(payload.args)
    || asRecord(payload.parameters)
    || asRecord(toolDetails.parameters)
    || null;
  const metadata = asRecord(toolDetails.metadata);
  const toolCallState = buildToolCallMessageState({
    rawToolCall: asRecord(metadata?.model_facing_tool_call),
    fallbackToolName: toolName,
    fallbackToolCallId: normalizeOptionalText(payload.requestId)
      || normalizeOptionalText(payload.request_id)
      || entry.id,
    fallbackArguments: args,
    metadata,
    toolCallDetails: toolDetails,
    correlationId: normalizeOptionalText(payload.correlationId)
      || normalizeOptionalText(payload.correlation_id),
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
    toolMetadata: entry.payload || null,
  };
}

function buildToolOutputMessage(entry, currentTurnProjection) {
  const payload = asRecord(entry.payload) || {};
  const toolDetails = asRecord(payload.structuredPayload) || payload;
  const toolName = normalizeOptionalText(entry.toolName)
    || normalizeOptionalText(payload.toolName)
    || normalizeOptionalText(payload.tool_name)
    || normalizeOptionalText(toolDetails.tool_name);
  const text = normalizeText(entry.text) || (toolName ? `${toolName} completed` : 'Tool completed');
  return {
    ...buildToolOutputEnvelopeMessage({
      outputText: text,
      sourceEventType: entry.sourceEventType || 'tool_output',
      sourceChannel: entry.sourceChannel || SDK_CURRENT_TURN_SOURCE_CHANNEL,
      screenshot: normalizeOptionalText(payload.screenshot) || normalizeOptionalText(toolDetails.screenshot),
      screenshotRef: normalizeOptionalText(payload.screenshotRef) || normalizeOptionalText(toolDetails.screenshot_ref),
      screenshotUrl: normalizeOptionalText(payload.screenshotUrl) || normalizeOptionalText(toolDetails.screenshot_url),
      screenshotContentType: normalizeOptionalText(payload.screenshotContentType)
        || normalizeOptionalText(toolDetails.screenshot_content_type),
      toolMetadata: asRecord(toolDetails.metadata) || asRecord(payload.metadata),
      toolName,
      executionTime: typeof toolDetails.execution_time === 'number' ? toolDetails.execution_time : null,
      success: typeof toolDetails.success === 'boolean' ? toolDetails.success : null,
      correlationId: normalizeOptionalText(payload.correlationId)
        || normalizeOptionalText(payload.correlation_id)
        || normalizeOptionalText(toolDetails.correlation_id),
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
