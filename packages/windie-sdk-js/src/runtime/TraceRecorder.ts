/**
 * Provides the trace recorder module for the TypeScript SDK runtime.
 */

import { createRuntimeId } from '../conversation/events.js';
import type {
  JsonRecord,
  TraceContext,
  TraceError,
  TraceEventPayload,
  TraceRuntime,
  TraceStatus,
} from '../conversation/types.js';

export type TraceEventInput = {
  path: string;
  stage: string;
  status: TraceStatus;
  runtime?: TraceRuntime;
  parentSpanId?: string | null;
  requestId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  data?: JsonRecord | null;
  error?: unknown;
};

export type TraceRecorderOptions = {
  conversationRef: string;
  turnRef?: string | null;
  userId?: string | null;
  traceId?: string | null;
  runtime?: TraceRuntime;
  emit?: (payload: TraceEventPayload) => void | Promise<void>;
};

const REDACTED_KEYS = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'bearer',
  'bearertoken',
  'content',
  'credential',
  'credentials',
  'embedding',
  'embeddings',
  'filecontent',
  'memory',
  'memories',
  'messagetext',
  'oauthstate',
  'password',
  'providerpayload',
  'rawrows',
  'refreshtoken',
  'screenshot',
  'secret',
  'shelloutput',
  'sqlrow',
  'sqlrows',
  'stack',
  'text',
  'token',
  'usertext',
]);

function isoNow(): string {
  return new Date().toISOString();
}

function toError(error: unknown): TraceError | null {
  if (!error) {
    return null;
  }
  if (error instanceof Error) {
    return {
      code: error.name || 'Error',
      message: error.message || 'Unknown trace error',
    };
  }
  if (typeof error === 'object' && !Array.isArray(error)) {
    const record = error as JsonRecord;
    const code = typeof record.code === 'string' && record.code.trim()
      ? record.code.trim()
      : 'Error';
    const message = typeof record.message === 'string' && record.message.trim()
      ? record.message.trim()
      : 'Unknown trace error';
    return { code, message };
  }
  return {
    code: 'Error',
    message: String(error),
  };
}

function sanitizeTraceValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeTraceValue);
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  const sanitized: JsonRecord = {};
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (REDACTED_KEYS.has(normalizedKey) || normalizedKey.endsWith('token')) {
      sanitized[key] = '[redacted]';
      continue;
    }
    sanitized[key] = sanitizeTraceValue(entry);
  }
  return sanitized;
}

export function sanitizeTraceData(data?: JsonRecord | null): JsonRecord | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  return sanitizeTraceValue(data) as JsonRecord;
}

export class TraceRecorder {
  private readonly conversationRef: string;
  private readonly turnRef: string | null;
  private readonly userId: string | null;
  private readonly runtime: TraceRuntime;
  private readonly emit?: (payload: TraceEventPayload) => void | Promise<void>;
  readonly traceId: string;

  constructor(options: TraceRecorderOptions) {
    this.conversationRef = options.conversationRef;
    this.turnRef = options.turnRef ?? null;
    this.userId = options.userId ?? null;
    this.runtime = options.runtime ?? 'sdk';
    this.emit = options.emit;
    this.traceId = options.traceId || createRuntimeId('trace');
  }

  context(parentSpanId?: string | null): TraceContext {
    return {
      traceId: this.traceId,
      parentSpanId: parentSpanId ?? null,
      conversationRef: this.conversationRef,
      turnRef: this.turnRef,
      userId: this.userId,
    };
  }

  async record(input: TraceEventInput): Promise<TraceEventPayload> {
    const endedAt = input.endedAt ?? isoNow();
    const payload: TraceEventPayload = {
      schemaVersion: 1,
      traceId: this.traceId,
      spanId: createRuntimeId('span'),
      parentSpanId: input.parentSpanId ?? null,
      path: input.path,
      stage: input.stage,
      status: input.status,
      runtime: input.runtime ?? this.runtime,
      conversationRef: this.conversationRef,
      turnRef: this.turnRef,
      userId: this.userId,
      requestId: input.requestId ?? null,
      startedAt: input.startedAt ?? null,
      endedAt,
      durationMs: typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
        ? input.durationMs
        : null,
      ...(input.data ? { data: sanitizeTraceData(input.data) } : {}),
      error: toError(input.error),
    };
    await this.emit?.(payload);
    return payload;
  }
}
