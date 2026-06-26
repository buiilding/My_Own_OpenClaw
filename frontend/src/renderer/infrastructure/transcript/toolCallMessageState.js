/**
 * Provides the tool call message state module for the renderer UI.
 */

function cloneObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function cloneArguments(value) {
  const cloned = cloneObject(value);
  return cloned ? { ...cloned } : null;
}

function sanitizeFallbackArgumentsForDisplay(argumentsValue, toolCallValidationFailed) {
  const clonedArguments = cloneArguments(argumentsValue);
  if (!clonedArguments) {
    return null;
  }
  if (toolCallValidationFailed !== true) {
    return clonedArguments;
  }

  delete clonedArguments.raw_arguments_preview;
  delete clonedArguments.parse_error;
  return Object.keys(clonedArguments).length > 0 ? clonedArguments : null;
}

function normalizeToolCallDisplayMetadata(metadata) {
  const normalized = cloneObject(metadata);
  if (!normalized) {
    return undefined;
  }
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

function buildNormalizedToolCall({
  rawToolCall,
  fallbackToolName = null,
  fallbackToolCallId = null,
  fallbackArguments = null,
  metadata = null,
  toolCallValidationFailed = false,
  rawToolCallPreview = null,
  rawArgumentsPreview = null,
  parseError = null,
  executionSkipped = false,
}) {
  const toolCall = cloneObject(rawToolCall) || {};
  const resolvedId = normalizeOptionalString(toolCall.id) || normalizeOptionalString(fallbackToolCallId);
  const resolvedName = normalizeOptionalString(toolCall.name) || normalizeOptionalString(fallbackToolName);
  const resolvedArguments = (
    cloneArguments(toolCall.arguments)
    || cloneArguments(toolCall.args)
    || sanitizeFallbackArgumentsForDisplay(fallbackArguments, toolCallValidationFailed)
    || {}
  );
  const resolvedMetadata = normalizeToolCallDisplayMetadata(metadata);
  const thoughtSignature = resolveThoughtSignature(toolCall, metadata);
  const resolvedRawToolCallPreview = normalizeOptionalString(rawToolCallPreview);
  const resolvedRawArgumentsPreview = normalizeOptionalString(rawArgumentsPreview);
  const resolvedParseError = normalizeOptionalString(parseError);
  const isRecoverableParseFailure = toolCallValidationFailed === true;

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
  if (resolvedRawToolCallPreview) {
    normalizedToolCall.raw_tool_call_preview = resolvedRawToolCallPreview;
  }
  if (resolvedRawArgumentsPreview) {
    normalizedToolCall.raw_arguments_preview = resolvedRawArgumentsPreview;
  }
  if (resolvedParseError) {
    normalizedToolCall.parse_error = resolvedParseError;
  }
  if (executionSkipped === true) {
    normalizedToolCall.execution_skipped = true;
  }

  return Object.keys(normalizedToolCall).length > 0 ? normalizedToolCall : null;
}

function resolveToolCallText(rawContent, normalizedToolCall, rawToolCallPreview, toolCallValidationFailed) {
  if (typeof rawContent === 'string' && rawContent.length > 0) {
    return rawContent;
  }

  if (toolCallValidationFailed === true) {
    const resolvedRawToolCallPreview = normalizeOptionalString(rawToolCallPreview);
    if (resolvedRawToolCallPreview) {
      return resolvedRawToolCallPreview;
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
  toolCallValidationFailed = false,
  rawToolCallPreview = null,
  rawArgumentsPreview = null,
  parseError = null,
  executionSkipped = false,
  toolCallDetails = null,
  correlationId = null,
}) {
  const normalizedToolCall = buildNormalizedToolCall({
    rawToolCall,
    fallbackToolName,
    fallbackToolCallId,
    fallbackArguments,
    metadata,
    toolCallValidationFailed,
    rawToolCallPreview,
    rawArgumentsPreview,
    parseError,
    executionSkipped,
  });
  const text = resolveToolCallText(
    rawContent,
    normalizedToolCall,
    rawToolCallPreview,
    toolCallValidationFailed,
  );
  const resolvedCorrelationId = (
    normalizeOptionalString(correlationId)
    || normalizeOptionalString(normalizedToolCall?.id)
    || normalizeOptionalString(fallbackToolCallId)
    || null
  );

  return {
    text,
    toolCallDisplayText: text,
    toolCallDetails: cloneObject(toolCallDetails),
    correlationId: resolvedCorrelationId,
  };
}

export function buildToolBundleMessageState(payload) {
  const bundleId = normalizeOptionalString(payload?.bundleId) || normalizeOptionalString(payload?.bundle_id) || null;
  const normalizedTools = (
    Array.isArray(payload?.toolCalls)
      ? payload.toolCalls.map((tool) => cloneObject(tool)).filter(Boolean)
      : (Array.isArray(payload?.tools) ? payload.tools : []).map((tool) => ({
        name: normalizeOptionalString(tool?.name) || undefined,
        arguments: cloneArguments(tool?.args) || cloneArguments(tool?.arguments) || {},
        metadata: normalizeToolCallDisplayMetadata(tool?.metadata),
      }))
  );

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
    toolCalls: normalizedTools,
    toolCallDetails: cloneObject(payload),
    correlationId: bundleId,
  };
}
