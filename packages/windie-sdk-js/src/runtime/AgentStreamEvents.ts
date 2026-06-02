import type {
  ConversationEvent,
  JsonRecord,
} from '../conversation/types.js';
import { resolveToolOutputCorrelationKeys } from '../tools/toolCorrelationIds.js';
import type { WindieRuntimeEvent } from './ConversationRuntime.js';

export type WindieAgentStreamState =
  | 'idle'
  | 'sending'
  | 'thinking'
  | 'streaming'
  | 'tool_call'
  | 'tool_output'
  | 'error';

export type WindieAgentToolCall = {
  toolName: string;
  args: unknown;
  requestId: string | null;
  toolCallId: string | null;
  index: number;
};

export type WindieAgentToolOutput = {
  toolName: string;
  result: unknown;
  attachments: AgentToolAttachment[];
  success: boolean | null;
  error: string | null;
  requestId: string | null;
  toolCallId: string | null;
  index: number;
};

export type AgentToolAttachment = {
  kind: 'image' | 'binary';
  fieldPath: string;
  key: string;
  contentType: string | null;
  value: string;
  charLength: number;
};

export type WindieAgentStreamEvent =
  | {
      type: 'state';
      state: WindieAgentStreamState;
      conversationRef: string;
      turnRef: string | null;
    }
  | {
      type: 'user_message';
      text: string;
      content: string;
      conversationRef: string;
      turnRef: string | null;
    }
  | {
      type: 'reasoning_delta';
      text: string;
      conversationRef: string;
      turnRef: string | null;
    }
  | {
      type: 'assistant_delta';
      text: string;
      conversationRef: string;
      turnRef: string | null;
    }
  | {
      type: 'assistant_message';
      text: string;
      conversationRef: string;
      turnRef: string | null;
    }
  | {
      type: 'tool_calls';
      calls: WindieAgentToolCall[];
      conversationRef: string;
      turnRef: string | null;
    }
  | {
      type: 'tool_outputs';
      outputs: WindieAgentToolOutput[];
      conversationRef: string;
      turnRef: string | null;
    }
  | {
      type: 'memory_diagnostic';
      stage: string;
      message: string;
      error: string | null;
      episodicCount: number | null;
      semanticCount: number | null;
      memoryType?: string | null;
      memoryId?: string | null;
      contentLength?: number | null;
      userQueryLength?: number | null;
      assistantResponseLength?: number | null;
      conversationRef: string;
      turnRef: string | null;
    }
  | {
      type: 'error';
      message: string;
      conversationRef: string;
      turnRef: string | null;
    };

type ConversationLocator = {
  conversationRef: string;
  turnRef: string | null;
};

export function toolOutputStreamKey(event: ConversationEvent): string | null {
  return toolOutputStreamKeys(event)[0] ?? null;
}

export function toolOutputStreamKeys(event: ConversationEvent): string[] {
  if (event.type !== 'tool_output' && event.type !== 'tool_bundle_output') {
    return [];
  }
  return resolveToolOutputCorrelationKeys(event.payload);
}

export function toAgentStreamEvents(runtimeEvent: WindieRuntimeEvent): WindieAgentStreamEvent[] {
  if (runtimeEvent.type === 'turn_started') {
    return [];
  }
  if (runtimeEvent.type === 'error') {
    const locator = locatorFromSnapshot(runtimeEvent.snapshot);
    return [
      stateEvent('error', locator),
      {
        type: 'error',
        message: runtimeEvent.error instanceof Error ? runtimeEvent.error.message : String(runtimeEvent.error),
        ...locator,
      },
    ];
  }

  const event = runtimeEvent.event;
  const locator = locatorFromConversationEvent(event);

  if (event.type === 'user_message') {
    return [
      stateEvent('sending', locator),
      {
        type: 'user_message',
        text: stringField(event.payload, 'text') ?? '',
        content: stringField(event.payload, 'content') ?? '',
        ...locator,
      },
      stateEvent('thinking', locator),
    ];
  }
  if (event.type === 'reasoning_delta') {
    return [
      stateEvent('thinking', locator),
      {
        type: 'reasoning_delta',
        text: stringField(event.payload, 'text', 'content', 'status') ?? '',
        ...locator,
      },
    ];
  }
  if (event.type === 'assistant_delta') {
    return [
      stateEvent('streaming', locator),
      {
        type: 'assistant_delta',
        text: stringField(event.payload, 'text', 'content', 'delta') ?? '',
        ...locator,
      },
    ];
  }
  if (event.type === 'assistant_message') {
    return [
      {
        type: 'assistant_message',
        text: stringField(event.payload, 'text', 'content') ?? '',
        ...locator,
      },
    ];
  }
  if (event.type === 'tool_call') {
    return [
      stateEvent('tool_call', locator),
      {
        type: 'tool_calls',
        calls: [toolCallFromPayload(event.payload, 0)],
        ...locator,
      },
    ];
  }
  if (event.type === 'tool_bundle_call') {
    const calls = bundleToolCallsFromPayload(event.payload);
    if (calls.length === 0) {
      return [stateEvent('tool_call', locator)];
    }
    return [
      stateEvent('tool_call', locator),
      {
        type: 'tool_calls',
        calls,
        ...locator,
      },
    ];
  }
  if (event.type === 'tool_output') {
    return [
      stateEvent('tool_output', locator),
      {
        type: 'tool_outputs',
        outputs: [toolOutputFromPayload(event.payload, 0)],
        ...locator,
      },
    ];
  }
  if (event.type === 'tool_bundle_output') {
    const outputs = bundleToolOutputsFromPayload(event.payload);
    if (outputs.length === 0) {
      return [stateEvent('tool_output', locator)];
    }
    return [
      stateEvent('tool_output', locator),
      {
        type: 'tool_outputs',
        outputs,
        ...locator,
      },
    ];
  }
  if (event.type === 'memory_retrieval_diagnostic') {
    return [{
      type: 'memory_diagnostic',
      stage: stringField(event.payload, 'stage') ?? 'unknown',
      message: stringField(event.payload, 'message') ?? 'Memory retrieval diagnostic',
      error: stringField(event.payload, 'error'),
      episodicCount: numberField(event.payload, 'episodicCount'),
      semanticCount: numberField(event.payload, 'semanticCount'),
      ...locator,
    }];
  }
  if (event.type === 'memory_persistence_diagnostic') {
    return [{
      type: 'memory_diagnostic',
      stage: stringField(event.payload, 'stage') ?? 'unknown',
      message: stringField(event.payload, 'message') ?? 'Memory persistence diagnostic',
      error: stringField(event.payload, 'error'),
      episodicCount: null,
      semanticCount: null,
      memoryType: stringField(event.payload, 'memoryType'),
      memoryId: stringField(event.payload, 'memoryId'),
      contentLength: numberField(event.payload, 'contentLength'),
      userQueryLength: numberField(event.payload, 'userQueryLength'),
      assistantResponseLength: numberField(event.payload, 'assistantResponseLength'),
      ...locator,
    }];
  }
  if (event.type === 'turn_completed' || event.type === 'turn_stopped') {
    const finalResponse = stringField(event.payload, 'finalResponse', 'final_response');
    return [
      ...(finalResponse ? [{
        type: 'assistant_message' as const,
        text: finalResponse,
        ...locator,
      }] : []),
      stateEvent('idle', locator),
    ];
  }
  if (event.type === 'turn_error' || event.type === 'runtime_error') {
    return [
      stateEvent('error', locator),
      {
        type: 'error',
        message: stringField(event.payload, 'message', 'content', 'error') ?? 'Windie stream failed',
        ...locator,
      },
    ];
  }
  return [];
}

function locatorFromSnapshot(snapshot: WindieRuntimeEvent['snapshot']): ConversationLocator {
  return {
    conversationRef: snapshot?.state.conversationRef ?? '',
    turnRef: snapshot?.state.activeTurnRef ?? null,
  };
}

function locatorFromConversationEvent(event: ConversationEvent): ConversationLocator {
  return {
    conversationRef: event.conversationRef,
    turnRef: event.turnRef ?? null,
  };
}

function stateEvent(state: WindieAgentStreamState, locator: ConversationLocator): WindieAgentStreamEvent {
  return {
    type: 'state',
    state,
    ...locator,
  };
}

function stringField(record: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function numberField(record: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function recordField(record: JsonRecord, ...keys: string[]): JsonRecord | null {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonRecord;
    }
  }
  return null;
}

function arrayField(record: JsonRecord, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function recordFromUnknown(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function modelFacingCallFromRecord(record: JsonRecord): JsonRecord | null {
  const metadata = recordField(record, 'metadata');
  const modelFacing = recordFromUnknown(metadata?.model_facing_tool_call)
    ?? recordFromUnknown(record.model_facing_tool_call);
  if (modelFacing) {
    return modelFacing;
  }
  const toolCalls = arrayField(record, 'tool_calls', 'toolCalls');
  return recordFromUnknown(toolCalls[0]);
}

function toolNameFromModelCall(call: JsonRecord | null): string | null {
  const fn = recordFromUnknown(call?.function);
  return stringField(call ?? {}, 'name', 'toolName', 'tool_name')
    ?? stringField(fn ?? {}, 'name');
}

function toolArgsFromModelCall(call: JsonRecord | null): unknown {
  const fn = recordFromUnknown(call?.function);
  const args = call?.arguments ?? fn?.arguments;
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as unknown;
    } catch {
      return args;
    }
  }
  return args ?? null;
}

function toolCallIdFromModelCall(call: JsonRecord | null): string | null {
  return stringField(call ?? {}, 'id', 'toolCallId', 'tool_call_id');
}

function toolCallFromPayload(payload: JsonRecord, index: number): WindieAgentToolCall {
  const modelFacing = modelFacingCallFromRecord(payload);
  return {
    toolName: toolNameFromModelCall(modelFacing)
      ?? stringField(payload, 'toolName', 'tool_name', 'name')
      ?? 'unknown_tool',
    args: toolArgsFromModelCall(modelFacing)
      ?? recordField(payload, 'args', 'parameters', 'arguments')
      ?? {},
    requestId: stringField(payload, 'requestId', 'request_id'),
    toolCallId: toolCallIdFromModelCall(modelFacing)
      ?? stringField(payload, 'toolCallId', 'tool_call_id'),
    index,
  };
}

function bundleToolCallsFromPayload(payload: JsonRecord): WindieAgentToolCall[] {
  const structuredPayload = recordField(payload, 'structuredPayload');
  const tools = arrayField(payload, 'tools');
  const structuredTools = structuredPayload ? arrayField(structuredPayload, 'tools') : [];
  return (tools.length > 0 ? tools : structuredTools)
    .map(recordFromUnknown)
    .filter((tool): tool is JsonRecord => Boolean(tool))
    .map((tool, index) => toolCallFromPayload(tool, index));
}

function resultFromPayload(payload: JsonRecord): unknown {
  if ('result' in payload) return payload.result;
  if ('data' in payload) return payload.data;
  if ('output' in payload) return payload.output;
  const structuredPayload = recordField(payload, 'structuredPayload');
  return structuredPayload ?? payload;
}

function isLargeBinaryDisplayField(key: string, value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length > 500
    && /screenshot|image|base64|bytes|data_url|dataUrl/i.test(key)
  );
}

function dataUrlContentType(value: string): string | null {
  const match = /^data:([^;,]+)[;,]/i.exec(value);
  return match?.[1]?.toLowerCase() ?? null;
}

function stringRecordField(record: JsonRecord | null, ...keys: string[]): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function contentTypeForAttachment(key: string, value: string, parent: JsonRecord | null): string | null {
  return dataUrlContentType(value)
    ?? stringRecordField(
      parent,
      `${key}_content_type`,
      `${key}ContentType`,
      'content_type',
      'contentType',
      'mime_type',
      'mimeType',
    );
}

function attachmentKind(key: string, contentType: string | null): AgentToolAttachment['kind'] {
  if (contentType?.toLowerCase().startsWith('image/')) {
    return 'image';
  }
  return /screenshot|image|data_url|dataUrl/i.test(key) ? 'image' : 'binary';
}

function appendPath(parentPath: string, key: string): string {
  return parentPath ? `${parentPath}.${key}` : key;
}

function appendArrayPath(parentPath: string, index: number): string {
  return `${parentPath}[${index}]`;
}

function extractToolResultAttachments(
  value: unknown,
  parent: JsonRecord | null = null,
  path = '',
): { result: unknown; attachments: AgentToolAttachment[] } {
  if (Array.isArray(value)) {
    const attachments: AgentToolAttachment[] = [];
    const result = value.map((item, index) => {
      const extracted = extractToolResultAttachments(item, null, appendArrayPath(path, index));
      attachments.push(...extracted.attachments);
      return extracted.result;
    });
    return { result, attachments };
  }

  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    const attachments: AgentToolAttachment[] = [];
    const result: JsonRecord = {};
    for (const [key, nested] of Object.entries(record)) {
      const fieldPath = appendPath(path, key);
      if (isLargeBinaryDisplayField(key, nested)) {
        const contentType = contentTypeForAttachment(key, nested, record);
        attachments.push({
          kind: attachmentKind(key, contentType),
          fieldPath,
          key,
          contentType,
          value: nested,
          charLength: nested.length,
        });
        continue;
      }
      const extracted = extractToolResultAttachments(nested, record, fieldPath);
      result[key] = extracted.result;
      attachments.push(...extracted.attachments);
    }
    return { result, attachments };
  }

  return { result: value, attachments: [] };
}

function successFromPayload(payload: JsonRecord): boolean | null {
  if (typeof payload.success === 'boolean') {
    return payload.success;
  }
  const status = stringField(payload, 'status');
  if (!status) {
    return null;
  }
  if (status === 'ok' || status === 'success') {
    return true;
  }
  if (status === 'error' || status === 'failure' || status === 'failed') {
    return false;
  }
  return null;
}

function toolOutputFromPayload(payload: JsonRecord, index: number): WindieAgentToolOutput {
  const extractedResult = extractToolResultAttachments(resultFromPayload(payload));
  return {
    toolName: stringField(payload, 'toolName', 'tool_name', 'tool', 'name') ?? 'unknown_tool',
    result: extractedResult.result,
    attachments: extractedResult.attachments,
    success: successFromPayload(payload),
    error: stringField(payload, 'error'),
    requestId: stringField(payload, 'requestId', 'request_id'),
    toolCallId: stringField(payload, 'toolCallId', 'tool_call_id'),
    index,
  };
}

function bundleToolOutputsFromPayload(payload: JsonRecord): WindieAgentToolOutput[] {
  const structuredPayload = recordField(payload, 'structuredPayload');
  const steps = arrayField(payload, 'stepResults', 'step_results');
  const structuredSteps = structuredPayload
    ? arrayField(structuredPayload, 'stepResults', 'step_results', 'results')
    : [];
  return (steps.length > 0 ? steps : structuredSteps)
    .map(recordFromUnknown)
    .filter((step): step is JsonRecord => Boolean(step))
    .map((step, index) => toolOutputFromPayload(step, index));
}
