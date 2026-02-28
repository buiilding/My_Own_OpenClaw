import type {
  ToolBundleEvent,
  ToolCallEvent,
  ToolOutputEvent,
} from '../../../types/backendEvents';

const MAX_THINKING_STATUS_LENGTH = 5000;

type ToolCallPayloadLike = ToolCallEvent['payload'];
type ToolBundlePayloadLike = ToolBundleEvent['payload'];
type ToolOutputPayloadLike = ToolOutputEvent['payload'];

export function buildThinkingStatus(currentStatus: string | null, chunk?: string): string {
  const updated = (currentStatus || '') + (chunk || '');
  return updated.length > MAX_THINKING_STATUS_LENGTH
    ? updated.slice(-MAX_THINKING_STATUS_LENGTH)
    : updated;
}

export function formatToolCallPayload(payload?: ToolCallPayloadLike): string {
  const modelFacing = resolveModelFacingToolCall(payload);
  return JSON.stringify(
    modelFacing,
    null,
    2,
  );
}

export function formatToolBundlePayload(payload?: ToolBundlePayloadLike): string {
  const tools = (payload?.tools || []).map((tool) => {
    const modelFacing = tool?.metadata?.model_facing_tool_call;
    if (modelFacing && typeof modelFacing === 'object') {
      return {
        id: typeof modelFacing.id === 'string' ? modelFacing.id : undefined,
        name: typeof modelFacing.name === 'string' ? modelFacing.name : tool?.name,
        arguments: (
          modelFacing.arguments
          && typeof modelFacing.arguments === 'object'
          && !Array.isArray(modelFacing.arguments)
        )
          ? modelFacing.arguments
          : (tool?.args || {}),
      };
    }
    return {
      name: tool?.name,
      arguments: tool?.args || {},
    };
  });
  return JSON.stringify(
    {
      bundle_id: payload?.bundle_id,
      tools,
    },
    null,
    2,
  );
}

export function formatToolOutputText(payload?: ToolOutputPayloadLike): string {
  if (typeof payload?.output === 'string' && payload.output.length > 0) {
    return payload.output;
  }
  if (payload?.error) {
    return `Error: ${payload.error}`;
  }
  return 'No output';
}

export function resolveModelFacingToolCall(payload?: ToolCallPayloadLike): {
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  thought_signature?: string;
  raw_arguments_preview?: string;
  parse_error?: string;
  frontend_execution_skipped?: boolean;
} {
  const modelFacing = payload?.metadata?.model_facing_tool_call;
  const modelArguments = modelFacing?.arguments;
  const fallbackParameters = payload?.parameters;
  const metadata = payload?.metadata;
  const isRecoverableParseFailure = metadata?.llm_tool_call_validation_failed === true;
  const rawArgumentsPreview = (
    typeof metadata?.llm_tool_call_raw_arguments_preview === 'string'
      ? metadata.llm_tool_call_raw_arguments_preview
      : null
  );
  const parseError = (
    typeof metadata?.llm_tool_call_parse_error === 'string'
      ? metadata.llm_tool_call_parse_error
      : null
  );
  const thoughtSignature = (
    typeof modelFacing?.thought_signature === 'string'
      ? modelFacing.thought_signature
      : (
        typeof modelFacing?.thoughtSignature === 'string'
          ? modelFacing.thoughtSignature
          : (
            typeof metadata?.thought_signature === 'string'
              ? metadata.thought_signature
              : (
                typeof metadata?.thoughtSignature === 'string'
                  ? metadata.thoughtSignature
                  : null
              )
          )
      )
  );
  const resolvedArguments = (
    modelArguments
    && typeof modelArguments === 'object'
    && !Array.isArray(modelArguments)
  )
    ? modelArguments
    : (fallbackParameters || {});

  if (isRecoverableParseFailure) {
    return {
      id: typeof modelFacing?.id === 'string' ? modelFacing.id : undefined,
      name: (
        typeof modelFacing?.name === 'string'
          ? modelFacing.name
          : payload?.tool_name
      ),
      thought_signature: thoughtSignature || undefined,
      raw_arguments_preview: rawArgumentsPreview || undefined,
      parse_error: parseError || undefined,
      frontend_execution_skipped: metadata?.skip_frontend_execution === true,
    };
  }

  return {
    id: typeof modelFacing?.id === 'string' ? modelFacing.id : undefined,
    name: (
      typeof modelFacing?.name === 'string'
        ? modelFacing.name
        : payload?.tool_name
    ),
    arguments: resolvedArguments,
    thought_signature: thoughtSignature || undefined,
  };
}
