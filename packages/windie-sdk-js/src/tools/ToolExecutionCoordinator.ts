import { createConversationEvent, createRuntimeId } from '../conversation/events.js';
import type {
  ConversationEvent,
  ConversationStore,
  JsonRecord,
  LocalRuntime,
  LocalToolCall,
  LocalToolResult,
} from '../conversation/types.js';

export type ToolExecutionCoordinatorOptions = {
  localRuntime?: Partial<Pick<LocalRuntime, 'executeTool'>> | null;
  store?: Pick<ConversationStore, 'appendEvent'> | null;
  sendToolResult: (payload: JsonRecord) => Promise<void>;
  sendToolBundleResult: (payload: JsonRecord) => Promise<void>;
};

export type ToolClaimResult = {
  claimed: boolean;
  reason?: string;
};

function normalizeToolResultData(data: JsonRecord | undefined): JsonRecord {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  if (typeof data.llm_content === 'string' && data.llm_content.trim()) {
    return data;
  }
  const display = typeof data.return_display === 'string' ? data.return_display : '';
  return {
    ...data,
    llm_content: display || JSON.stringify(data),
  };
}

function failureResult(error: unknown): LocalToolResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    data: {
      llm_content: error instanceof Error ? error.message : String(error),
    },
  };
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
    const payload = {
      request_id: call.requestId,
      success,
      data: normalizeToolResultData(result.data),
      error: success ? undefined : result.error || 'Tool execution failed',
    };
    try {
      await this.options.sendToolResult(payload);
    } finally {
      await this.options.store?.appendEvent(createConversationEvent({
        type: 'tool_output',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sidecar',
        payload: {
          requestId: call.requestId,
          toolName: call.toolName,
          success,
          result: payload.data,
          error: payload.error ?? null,
          elapsedMs: Date.now() - startedAt,
        },
      }));
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
      let result: LocalToolResult;
      try {
        result = await this.options.localRuntime.executeTool({
          toolName,
          args: record.args && typeof record.args === 'object' && !Array.isArray(record.args)
            ? record.args as JsonRecord
            : {},
          bundleId,
          turnRef: event.turnRef,
          conversationRef: event.conversationRef,
        });
      } catch (error) {
        result = failureResult(error);
      }
      const success = result.success !== false;
      stepResults.push({
        tool: toolName,
        status: success ? 'success' : 'failure',
        output: success
          ? normalizeToolResultData(result.data)
          : { error: result.error || 'Tool execution failed' },
      });
    }
    const failures = stepResults.filter(step => step.status !== 'success');
    const status = failures.length === 0
      ? 'success'
      : (failures.length === stepResults.length ? 'failure' : 'partial_failure');
    const resultPayload = {
      bundle_id: bundleId,
      status,
      step_results: stepResults,
      error: failures.length > 0 ? `${failures.length} bundled tool step(s) failed` : undefined,
    };
    try {
      await this.options.sendToolBundleResult(resultPayload);
    } finally {
      await this.options.store?.appendEvent(createConversationEvent({
        eventId: createRuntimeId('bundle_output'),
        type: 'tool_bundle_output',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sidecar',
        payload: {
          bundleId,
          status,
          stepResults,
          error: resultPayload.error ?? null,
        },
      }));
    }
  }
}
