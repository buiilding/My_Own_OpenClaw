import type { BundleExecutionResult, ToolExecutionResult } from '../../../infrastructure/services/ToolExecutionService';
import type { ChatMessage } from '../stores/chatStore';

export type TranscriptModelContext = {
  modelId: string | null;
  modelProvider: string | null;
};

type BundleToolInput = {
  name?: unknown;
  args?: unknown;
};

export function buildToolOutputMessage(result: ToolExecutionResult): ChatMessage {
  const toolOutputDetails = {
    result: result.result,
    system_state: result.systemState || null,
    correlation_id: result.correlationId,
    tool_name: result.toolName,
    execution_time: result.executionTime,
  };
  return {
    id: crypto.randomUUID(),
    text: result.formattedMessage,
    sender: 'assistant',
    type: 'tool-output',
    screenshotRef: result.screenshotRef || null,
    screenshotUrl: result.screenshotUrl || null,
    toolMetadata: result.result.data && typeof result.result.data === 'object'
      ? result.result.data.metadata || null
      : null,
    toolName: result.toolName,
    executionTime: result.executionTime,
    success: result.result.success,
    correlationId: result.correlationId,
    modelFacingToolOutput: result.formattedMessage,
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
  return {
    id: crypto.randomUUID(),
    text: result.formattedMessage,
    sender: 'assistant',
    type: 'tool-output',
    screenshotRef: result.screenshotRef || null,
    screenshotUrl: result.screenshotUrl || null,
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
    executionTime: result.totalTime,
    success: result.results.every((toolResult) => toolResult.success),
    correlationId: result.correlationId,
    modelFacingToolOutput: result.formattedMessage,
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

export function mapBundleTools(tools: BundleToolInput[] | null | undefined) {
  return (tools || [])
    .filter((tool) => typeof tool?.name === 'string' && tool.name.length > 0)
    .map((tool) => ({
      toolName: tool.name as string,
      args: tool.args && typeof tool.args === 'object' ? tool.args : {},
    }));
}

export function resolveToolCallCorrelationId(
  payload: { correlation_id?: string; request_id?: string } | null | undefined,
  eventId?: string,
) {
  return payload?.correlation_id || payload?.request_id || eventId || crypto.randomUUID();
}
