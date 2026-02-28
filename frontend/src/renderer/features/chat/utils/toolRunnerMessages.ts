import type { BundleExecutionResult, ToolExecutionResult } from '../../../infrastructure/services/ToolExecutionService';
import type { ChatMessage } from '../stores/chatStore';
import { resolveToolCallCorrelationId as resolveSharedToolCallCorrelationId } from './toolCorrelationIds';

export type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

type BundleToolInput = {
  name?: unknown;
  args?: unknown;
};

type ToolOutputEnvelopeInput = {
  formattedMessage: string;
  screenshotRef: string | null | undefined;
  screenshotUrl: string | null | undefined;
  executionTime: number;
  success: boolean;
  correlationId: string;
};

function buildToolOutputEnvelope(result: ToolOutputEnvelopeInput) {
  return {
    id: crypto.randomUUID(),
    text: result.formattedMessage,
    sender: 'assistant' as const,
    type: 'tool-output' as const,
    sourceEventType: 'tool-runner-result' as const,
    sourceChannel: 'renderer-tool-runner' as const,
    screenshotRef: result.screenshotRef || null,
    screenshotUrl: result.screenshotUrl || null,
    executionTime: result.executionTime,
    success: result.success,
    correlationId: result.correlationId,
    modelFacingToolOutput: result.formattedMessage,
  };
}

export function buildToolOutputMessage(result: ToolExecutionResult): ChatMessage {
  const toolOutputDetails = {
    result: result.result,
    system_state: result.systemState || null,
    correlation_id: result.correlationId,
    tool_name: result.toolName,
    execution_time: result.executionTime,
  };
  return {
    ...buildToolOutputEnvelope({
      formattedMessage: result.formattedMessage,
      screenshotRef: result.screenshotRef,
      screenshotUrl: result.screenshotUrl,
      executionTime: result.executionTime,
      success: result.result.success,
      correlationId: result.correlationId,
    }),
    toolMetadata: result.result.data && typeof result.result.data === 'object'
      ? result.result.data.metadata || null
      : null,
    toolName: result.toolName,
    toolOutputDetails,
  };
}

export function buildBundleOutputMessage(result: BundleExecutionResult): ChatMessage {
  const toolOutputDetails = {
    bundled: true,
    results: result.results,
    correlation_id: result.correlationId,
    execution_time_total: result.totalTime,
  };
  const isSuccessful = result.results.every((toolResult) => toolResult.success);
  return {
    ...buildToolOutputEnvelope({
      formattedMessage: result.formattedMessage,
      screenshotRef: result.screenshotRef,
      screenshotUrl: result.screenshotUrl,
      executionTime: result.totalTime,
      success: isSuccessful,
      correlationId: result.correlationId,
    }),
    toolMetadata: {
      bundled: true,
      tool_count: result.results.length,
      tools: result.results.map((toolResult) => ({
        tool_name: toolResult.tool_name,
        success: toolResult.success,
        error: toolResult.error,
      })),
    },
    toolName: `bundled_tools (${result.results.length} tools)`,
    toolOutputDetails,
  };
}

export function buildTranscriptMetadata(
  toolName: string,
  correlationId: string,
  screenshotRef: string | null | undefined,
  modelContext: TranscriptModelContext,
) {
  return {
    messageType: 'tool-output' as const,
    toolName,
    correlationId,
    screenshotRef: screenshotRef || null,
    modelId: modelContext.modelId,
    modelProvider: modelContext.modelProvider,
  };
}

export function mapBundleTools(
  tools: BundleToolInput[] | null | undefined,
): Array<{ toolName: string; args: Record<string, unknown> }> {
  return (tools || [])
    .filter((tool) => typeof tool?.name === 'string' && tool.name.length > 0)
    .map((tool) => ({
      toolName: tool.name as string,
      args: tool.args && typeof tool.args === 'object'
        ? (tool.args as Record<string, unknown>)
        : {},
    }));
}

export function resolveToolCallCorrelationId(
  payload: { correlation_id?: string; request_id?: string } | null | undefined,
  eventId?: string,
) {
  return resolveSharedToolCallCorrelationId(payload, eventId) || crypto.randomUUID();
}
