import { createConversationEvent, createRuntimeId } from '../conversation/events.js';
import type {
  ConversationEvent,
  ConversationStore,
  JsonRecord,
  LocalRuntime,
  LocalToolCall,
  LocalToolResult,
  ToolBundleResultPayload,
  ToolResultPayload,
} from '../conversation/types.js';
import { resolveModelFacingToolCallId } from './toolCorrelationIds.js';

export type ToolExecutionCoordinatorOptions = {
  localRuntime?: Partial<Pick<LocalRuntime, 'executeTool'>> | null;
  store?: Pick<ConversationStore, 'appendEvent'> | null;
  sendToolResult: (payload: ToolResultPayload) => Promise<void>;
  sendToolBundleResult: (payload: ToolBundleResultPayload) => Promise<void>;
};

export type ToolClaimResult = {
  claimed: boolean;
  reason?: string;
};

function normalizeToolResultData(data: JsonRecord | undefined): JsonRecord {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  const display = typeof data.display_content === 'string'
    ? data.display_content
    : (typeof data.return_display === 'string'
      ? data.return_display
      : (typeof data.output === 'string'
        ? data.output
        : (typeof data.message === 'string' ? data.message : '')));
  if (typeof data.llm_content === 'string' && data.llm_content.trim()) {
    return {
      ...data,
      display_content: display || data.llm_content,
    };
  }
  return {
    ...data,
    display_content: display || JSON.stringify(data),
    llm_content: display || JSON.stringify(data),
  };
}

function failureResult(error: unknown): LocalToolResult {
  const message = errorMessage(error);
  return {
    success: false,
    error: message,
    data: {
      llm_content: message,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringPayloadField(payload: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function localToolCallFromEvent(event: ConversationEvent): LocalToolCall | null {
  const payload = event.payload;
  const toolName = typeof payload.toolName === 'string'
    ? payload.toolName
    : (typeof payload.tool_name === 'string' ? payload.tool_name : '');
  if (!toolName) {
    return null;
  }
  return {
    toolName,
    args: payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args)
      ? payload.args as JsonRecord
      : {},
    requestId: typeof payload.requestId === 'string'
      ? payload.requestId
      : (typeof payload.request_id === 'string' ? payload.request_id : null),
    bundleId: typeof payload.bundleId === 'string'
      ? payload.bundleId
      : (typeof payload.bundle_id === 'string' ? payload.bundle_id : null),
    toolCallId: stringPayloadField(payload, 'toolCallId', 'tool_call_id')
      ?? resolveModelFacingToolCallId(payload),
    correlationId: stringPayloadField(payload, 'correlationId', 'correlation_id'),
    turnRef: event.turnRef,
    conversationRef: event.conversationRef,
  };
}

export class ToolExecutionCoordinator {
  constructor(private readonly options: ToolExecutionCoordinatorOptions) {}

  canClaim(event: ConversationEvent): ToolClaimResult {
    if (!this.options.localRuntime?.executeTool) {
      return { claimed: false, reason: 'missing-local-runtime' };
    }
    if (event.type !== 'tool_call' && event.type !== 'tool_bundle_call') {
      return { claimed: false, reason: 'not-tool-event' };
    }
    if (event.type === 'tool_call') {
      const call = localToolCallFromEvent(event);
      if (!call?.toolName || !call.requestId) {
        return { claimed: false, reason: 'missing-tool-name-or-request-id' };
      }
    }
    if (event.type === 'tool_bundle_call') {
      const bundleId = typeof event.payload.bundleId === 'string'
        ? event.payload.bundleId
        : (typeof event.payload.bundle_id === 'string' ? event.payload.bundle_id : '');
      if (!bundleId || !Array.isArray(event.payload.tools)) {
        return { claimed: false, reason: 'missing-bundle-id-or-tools' };
      }
    }
    return { claimed: true };
  }

  async execute(event: ConversationEvent): Promise<ToolClaimResult> {
    const claim = this.canClaim(event);
    if (!claim.claimed) {
      return claim;
    }
    if (event.type === 'tool_bundle_call') {
      await this.executeBundle(event);
      return claim;
    }
    await this.executeSingle(event);
    return claim;
  }

  private async executeSingle(event: ConversationEvent): Promise<void> {
    const call = localToolCallFromEvent(event);
    if (!call?.requestId || !this.options.localRuntime?.executeTool) {
      return;
    }
    const startedAt = Date.now();
    let result: LocalToolResult;
    try {
      result = await this.options.localRuntime.executeTool(call);
    } catch (error) {
      result = failureResult(error);
    }
    const success = result.success !== false;
    const payload: ToolResultPayload = {
      request_id: call.requestId,
      success,
      data: normalizeToolResultData(result.data),
      error: success ? undefined : result.error || 'Tool execution failed',
    };
    let deliveryError: unknown = null;
    try {
      await this.options.sendToolResult(payload);
    } catch (error) {
      deliveryError = error;
    } finally {
      const deliveryErrorMessage = deliveryError
        ? `Tool result delivery failed: ${errorMessage(deliveryError)}`
        : null;
      await this.options.store?.appendEvent(createConversationEvent({
        type: 'tool_output',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sidecar',
        payload: {
          requestId: call.requestId,
          toolCallId: call.toolCallId ?? null,
          correlationId: call.correlationId ?? null,
          toolName: call.toolName,
          success: deliveryError ? false : success,
          result: payload.data,
          error: deliveryErrorMessage ?? payload.error ?? null,
          deliveryFailed: Boolean(deliveryError),
          elapsedMs: Date.now() - startedAt,
        },
      }));
    }
    if (deliveryError) {
      throw deliveryError;
    }
  }

  private async executeBundle(event: ConversationEvent): Promise<void> {
    if (!this.options.localRuntime?.executeTool) {
      return;
    }
    const payload = event.payload;
    const bundleId = typeof payload.bundleId === 'string'
      ? payload.bundleId
      : (typeof payload.bundle_id === 'string' ? payload.bundle_id : '');
    const tools = Array.isArray(payload.tools) ? payload.tools : [];
    const stepResults = [];
    for (const step of tools) {
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        continue;
      }
      const record = step as JsonRecord;
      const toolName = typeof record.name === 'string' ? record.name : '';
      if (!toolName) {
        continue;
      }
      const toolCallId = stringPayloadField(record, 'toolCallId', 'tool_call_id')
        ?? resolveModelFacingToolCallId(record);
      let result: LocalToolResult;
      try {
        result = await this.options.localRuntime.executeTool({
          toolName,
          args: record.args && typeof record.args === 'object' && !Array.isArray(record.args)
            ? record.args as JsonRecord
            : {},
          bundleId,
          toolCallId,
          turnRef: event.turnRef,
          conversationRef: event.conversationRef,
        });
      } catch (error) {
        result = failureResult(error);
      }
      const success = result.success !== false;
      stepResults.push({
        tool: toolName,
        ...(toolCallId ? { toolCallId } : {}),
        status: success ? 'ok' : 'error',
        output: success
          ? normalizeToolResultData(result.data)
          : { error: result.error || 'Tool execution failed' },
      });
    }
    const failures = stepResults.filter(step => step.status !== 'ok');
    const status = failures.length === 0
      ? 'success'
      : (failures.length === stepResults.length ? 'failure' : 'partial_failure');
    const resultPayload: ToolBundleResultPayload = {
      bundle_id: bundleId,
      status,
      step_results: stepResults,
      error: failures.length > 0 ? `${failures.length} bundled tool step(s) failed` : undefined,
    };
    let deliveryError: unknown = null;
    try {
      await this.options.sendToolBundleResult(resultPayload);
    } catch (error) {
      deliveryError = error;
    } finally {
      const deliveryErrorMessage = deliveryError
        ? `Tool bundle result delivery failed: ${errorMessage(deliveryError)}`
        : null;
      await this.options.store?.appendEvent(createConversationEvent({
        eventId: createRuntimeId('bundle_output'),
        type: 'tool_bundle_output',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sidecar',
        payload: {
          bundleId,
          status: deliveryError ? 'failure' : status,
          stepResults,
          error: deliveryErrorMessage ?? resultPayload.error ?? null,
          deliveryFailed: Boolean(deliveryError),
        },
      }));
    }
    if (deliveryError) {
      throw deliveryError;
    }
  }
}
