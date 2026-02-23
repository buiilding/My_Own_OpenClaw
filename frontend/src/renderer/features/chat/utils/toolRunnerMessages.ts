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
  };
}

export function buildBundleOutputMessage(result: BundleExecutionResult): ChatMessage {
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
