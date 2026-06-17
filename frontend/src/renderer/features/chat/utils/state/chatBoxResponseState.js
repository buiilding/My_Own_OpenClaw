/**
 * Provides the chat box response state module for the renderer UI.
 */

import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../../../infrastructure/transcript/toolCallMessageState';
import { buildToolCallChatMessageState } from '../../../../infrastructure/transcript/toolCallChatMessageState';
import { buildToolOutputEnvelopeMessage } from '../toolOutputMessages';
import { buildScreenshotAttachment } from '../chatStream/chatStreamEventUtils';
import { SDK_CURRENT_TURN_SOURCE_CHANNEL } from '../message/sourceChannels';

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
  const toolName = readString(toolEvent.toolName) || readString(payload.toolName) || '';
  const requestId = readString(toolEvent.requestId) || readString(payload.requestId);
  const correlationId = (
    readString(toolEvent.correlationId)
    || readString(payload.correlationId)
  );

  if (toolName === 'tool_bundle' || readArray(payload.tools) || readArray(toolCallDetails.tools)) {
    const bundlePayload = {
      ...toolCallDetails,
      ...payload,
      tools: readArray(payload.tools) || toolCallDetails.tools,
    };
    const bundleState = buildToolBundleMessageState(bundlePayload);
    return buildToolCallChatMessageState({
      id: `${baseId}:tool:${toolEvent.id}`,
      text: bundleState.text,
      toolCallDisplayText: bundleState.toolCallDisplayText,
      toolCallDetails: bundleState.toolCallDetails ?? null,
      correlationId: bundleState.correlationId ?? null,
      sourceEventType: toolEvent.kind,
      sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
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
    sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
    turnRef: turnRef || undefined,
  });
}

function formatProjectedToolOutputText(payload) {
  const structuredPayload = asObject(payload.structuredPayload);
  const bundleSteps = [
    payload.stepResults,
    payload.step_results,
    structuredPayload?.stepResults,
    structuredPayload?.step_results,
    structuredPayload?.results,
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
  payload,
}) {
  const structuredPayload = asObject(payload.structuredPayload);
  const toolOutputDetails = structuredPayload || payload;
  const screenshot = readString(payload.screenshot) || readString(toolOutputDetails.screenshot);
  const screenshotRefValue = readString(payload.screenshotRef) || readString(toolOutputDetails.screenshot_ref);
  const { screenshotRef, screenshotUrl } = buildScreenshotAttachment(screenshotRefValue);
  const requestId = readString(toolEvent.requestId) || readString(payload.requestId);
  const correlationId = (
    readString(toolEvent.correlationId)
    || readString(payload.correlationId)
    || requestId
    || undefined
  );
  return {
    ...buildToolOutputEnvelopeMessage({
      outputText: toolEvent.text || formatProjectedToolOutputText(toolOutputDetails),
      sourceEventType: toolEvent.kind,
      sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
      screenshot: screenshotRef ? null : screenshot,
      screenshotRef,
      screenshotUrl,
      toolMetadata: asObject(toolOutputDetails.metadata),
      toolName: readString(toolEvent.toolName) || readString(payload.toolName),
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
    sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
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
    sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
  }];

  if (hasReasoning && !hasText) {
    messages.push({
      id: `${baseId}:thinking`,
      text: '',
      sender: 'assistant',
      type: 'llm-text',
      thinkingText: reasoningText,
      sourceEventType: 'reasoning_delta',
      sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
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
      sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
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
      sourceChannel: SDK_CURRENT_TURN_SOURCE_CHANNEL,
      turnRef: turnRef || undefined,
      isComplete: true,
    });
  }

  return messages;
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
