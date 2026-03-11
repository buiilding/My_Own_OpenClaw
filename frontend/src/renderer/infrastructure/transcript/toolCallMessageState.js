import {
  normalizeOptionalString,
} from './rehydratePayload';

function cloneObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}

function cloneArguments(value) {
  const cloned = cloneObject(value);
  return cloned ? { ...cloned } : null;
}

function sanitizeFallbackArgumentsForDisplay(argumentsValue, metadata) {
  const clonedArguments = cloneArguments(argumentsValue);
  if (!clonedArguments) {
    return null;
  }
  if (metadata?.llm_tool_call_validation_failed !== true) {
    return clonedArguments;
  }

  delete clonedArguments.raw_arguments_preview;
  delete clonedArguments.parse_error;
  return Object.keys(clonedArguments).length > 0 ? clonedArguments : null;
}

export function normalizeToolCallDisplayMetadata(metadata) {
  const normalized = cloneObject(metadata);
  if (!normalized) {
    return undefined;
  }
  delete normalized.model_facing_tool_call;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function resolveThoughtSignature(rawToolCall, metadata) {
  const rawThoughtSignature = normalizeOptionalString(
    rawToolCall?.thought_signature || rawToolCall?.thoughtSignature,
  );
  if (rawThoughtSignature) {
    return rawThoughtSignature;
  }
  return normalizeOptionalString(
    metadata?.thought_signature || metadata?.thoughtSignature,
  );
}

export function buildNormalizedToolCall({
  rawToolCall,
  fallbackToolName = null,
  fallbackToolCallId = null,
  fallbackArguments = null,
  metadata = null,
}) {
  const toolCall = cloneObject(rawToolCall) || {};
  const resolvedId = normalizeOptionalString(toolCall.id) || normalizeOptionalString(fallbackToolCallId);
  const resolvedName = normalizeOptionalString(toolCall.name) || normalizeOptionalString(fallbackToolName);
  const resolvedArguments = (
    cloneArguments(toolCall.arguments)
    || cloneArguments(toolCall.args)
    || sanitizeFallbackArgumentsForDisplay(fallbackArguments, metadata)
    || {}
  );
  const resolvedMetadata = normalizeToolCallDisplayMetadata(metadata);
  const thoughtSignature = resolveThoughtSignature(toolCall, metadata);
  const rawToolCallPreview = normalizeOptionalString(metadata?.llm_tool_call_raw_tool_call_preview);
  const rawArgumentsPreview = normalizeOptionalString(metadata?.llm_tool_call_raw_arguments_preview);
  const parseError = normalizeOptionalString(metadata?.llm_tool_call_parse_error);
  const frontendExecutionSkipped = metadata?.skip_frontend_execution === true;
  const isRecoverableParseFailure = metadata?.llm_tool_call_validation_failed === true;

  const normalizedToolCall = {};

  if (resolvedId) {
    normalizedToolCall.id = resolvedId;
  }
  if (resolvedName) {
    normalizedToolCall.name = resolvedName;
  }
  if (!isRecoverableParseFailure || Object.keys(resolvedArguments).length > 0) {
    normalizedToolCall.arguments = resolvedArguments;
  }
  if (resolvedMetadata) {
    normalizedToolCall.metadata = resolvedMetadata;
  }
  if (thoughtSignature) {
    normalizedToolCall.thought_signature = thoughtSignature;
  }
  if (rawToolCallPreview) {
    normalizedToolCall.raw_tool_call_preview = rawToolCallPreview;
  }
  if (rawArgumentsPreview) {
    normalizedToolCall.raw_arguments_preview = rawArgumentsPreview;
  }
  if (parseError) {
    normalizedToolCall.parse_error = parseError;
  }
  if (frontendExecutionSkipped) {
    normalizedToolCall.frontend_execution_skipped = true;
  }

  return Object.keys(normalizedToolCall).length > 0 ? normalizedToolCall : null;
}

function resolveToolCallText(rawContent, normalizedToolCall, metadata) {
  if (typeof rawContent === 'string' && rawContent.length > 0) {
    return rawContent;
  }

  if (metadata?.llm_tool_call_validation_failed === true) {
    const rawToolCallPreview = normalizeOptionalString(metadata?.llm_tool_call_raw_tool_call_preview);
    if (rawToolCallPreview) {
      return rawToolCallPreview;
    }
  }

  return JSON.stringify(normalizedToolCall || {}, null, 2);
}

export function buildToolCallMessageState({
  rawContent = null,
  rawToolCall = null,
  fallbackToolName = null,
  fallbackToolCallId = null,
  fallbackArguments = null,
  metadata = null,
  toolCallDetails = null,
  correlationId = null,
}) {
  const modelFacingToolCall = buildNormalizedToolCall({
    rawToolCall,
    fallbackToolName,
    fallbackToolCallId,
    fallbackArguments,
    metadata,
  });
  const text = resolveToolCallText(rawContent, modelFacingToolCall, metadata);
  const resolvedCorrelationId = (
    normalizeOptionalString(correlationId)
    || normalizeOptionalString(modelFacingToolCall?.id)
    || normalizeOptionalString(fallbackToolCallId)
    || null
  );

  return {
    text,
    toolCallDisplayText: text,
    modelFacingToolCall,
    toolCallDetails: cloneObject(toolCallDetails),
    correlationId: resolvedCorrelationId,
  };
}

export function buildToolBundleMessageState(payload) {
  const bundleId = normalizeOptionalString(payload?.bundle_id) || null;
  const normalizedTools = (Array.isArray(payload?.tools) ? payload.tools : []).map((tool) => (
    buildNormalizedToolCall({
      rawToolCall: cloneObject(tool?.metadata?.model_facing_tool_call),
      fallbackToolName: normalizeOptionalString(tool?.name),
      fallbackArguments: cloneArguments(tool?.args),
      metadata: tool?.metadata,
    }) || {
      name: normalizeOptionalString(tool?.name) || undefined,
      arguments: cloneArguments(tool?.args) || {},
      metadata: normalizeToolCallDisplayMetadata(tool?.metadata),
    }
  ));

  const text = JSON.stringify(
    {
      bundle_id: bundleId || undefined,
      tools: normalizedTools,
    },
    null,
    2,
  );

  return {
    text,
    toolCallDisplayText: text,
    modelFacingToolCall: null,
    toolCallDetails: cloneObject(payload),
    correlationId: bundleId,
  };
}
