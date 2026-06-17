/**
 * Provides the context enrichment pipeline module for the TypeScript SDK runtime.
 */

import type { JsonRecord, TraceContext } from '../conversation/types.js';
import type { AgentHostedBackendClient } from '../transport/HostedBackendHttpClient.js';
import type { AgentLocalRuntimeClient } from './LocalRuntime.js';
import type { TraceEventInput } from './TraceRecorder.js';

const PROMPT_MEMORY_RETRIEVAL = Object.freeze({
  combinedLimit: 6,
  episodicLimit: 4,
  semanticLimit: 2,
  semanticMinScore: 0.2,
});

const MEMORY_LOCAL_RUNTIME_SEARCH_TRACE_PATH = 'memory.local_runtime_search';

type ContextEnrichmentInput = {
  text: string;
  conversationRef: string;
  userId: string;
  payload?: JsonRecord | null;
  sdkClient: AgentHostedBackendClient;
  localRuntime?: AgentLocalRuntimeClient | null;
  memoryEnabled?: boolean;
  emitDiagnostic?: (diagnostic: MemoryRetrievalDiagnostic) => void | Promise<void>;
  traceContext?: TraceContext | null;
  emitTrace?: (event: TraceEventInput) => void | Promise<void>;
};

export type MemoryRetrievalDiagnosticStage =
  | 'local_runtime_missing'
  | 'embedding_request_failed'
  | 'local_runtime_search_failed'
  | 'search_empty';

export type MemoryRetrievalDiagnostic = {
  stage: MemoryRetrievalDiagnosticStage;
  conversationRef: string;
  userId: string;
  queryLength: number;
  message: string;
  error?: string;
  episodicCount?: number;
  semanticCount?: number;
};

type MemoryPersistenceDiagnosticStage =
  | 'memory_disabled'
  | 'local_runtime_missing'
  | 'turn_state_missing'
  | 'content_empty'
  | 'embedding_request_failed'
  | 'local_runtime_store_failed'
  | 'store_succeeded';

type MemoryPersistenceDiagnostic = {
  stage: MemoryPersistenceDiagnosticStage;
  conversationRef: string;
  userId: string;
  userQueryLength: number;
  assistantResponseLength: number;
  contentLength?: number;
  memoryType?: 'episodic';
  memoryId?: string | null;
  message: string;
  error?: string;
};

type ContextEnrichmentResult = {
  payload: JsonRecord;
  memories: {
    episodic: string[];
    semantic: string[];
  };
};

type StoreCompletedTurnMemoryResult = {
  memoryId?: string | null;
};

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stringEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function formatMemorySection(tagName: string, entries: string[]): string {
  if (entries.length === 0) {
    return `<${tagName}>\nNone\n</${tagName}>`;
  }
  return `<${tagName}>\n${entries.map(entry => `- ${escapeXml(entry)}`).join('\n')}\n</${tagName}>`;
}

function renderModelFacingUserContent(input: {
  text: string;
  memories?: { episodic?: string[]; semantic?: string[] } | null;
  attachmentContext?: string | null;
}): string {
  const parts = [
    formatMemorySection('episodic_memory', input.memories?.episodic ?? []),
    formatMemorySection('semantic_memory', input.memories?.semantic ?? []),
  ];
  if (typeof input.attachmentContext === 'string' && input.attachmentContext.trim()) {
    parts.push(`<attached_file_context>\n${escapeXml(input.attachmentContext.trim())}\n</attached_file_context>`);
  }
  parts.push(`<user_query>\n${escapeXml(input.text)}\n</user_query>`);
  return parts.join('\n\n');
}

function renderPlainModelFacingUserContent(input: {
  text: string;
  attachmentContext?: string | null;
}): string {
  const parts = [];
  if (typeof input.attachmentContext === 'string' && input.attachmentContext.trim()) {
    parts.push(`<attached_file_context>\n${escapeXml(input.attachmentContext.trim())}\n</attached_file_context>`);
  }
  parts.push(`<user_query>\n${escapeXml(input.text)}\n</user_query>`);
  return parts.join('\n\n');
}

export function formatCompletedTurnMemory(input: {
  userQuery: string;
  assistantResponse: string;
}): string {
  return `User: ${input.userQuery.trim()}\nAssistant: ${input.assistantResponse.trim()}`;
}

function normalizeMemories(response: unknown): { episodic: string[]; semantic: string[] } {
  const record = response && typeof response === 'object' && !Array.isArray(response)
    ? response as JsonRecord
    : {};
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data as JsonRecord
    : {};
  const memories = data.memories && typeof data.memories === 'object' && !Array.isArray(data.memories)
    ? data.memories as JsonRecord
    : {};
  return {
    episodic: stringEntries(memories.episodic),
    semantic: stringEntries(memories.semantic),
  };
}

function normalizeMemorySearchTrace(response: unknown): JsonRecord | undefined {
  const record = response && typeof response === 'object' && !Array.isArray(response)
    ? response as JsonRecord
    : {};
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data as JsonRecord
    : {};
  const traceSource = data.trace ?? record.trace;
  const trace = traceSource && typeof traceSource === 'object' && !Array.isArray(traceSource)
    ? traceSource as JsonRecord
    : null;
  return trace ?? undefined;
}

function shouldRetrieveMemories(payload: JsonRecord): boolean {
  return payload.memory_retrieval_enabled !== false;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return 'Unknown memory retrieval error';
}

function rpcFailureMessage(response: unknown, fallback = 'Memory RPC failed'): string | null {
  const record = response && typeof response === 'object' && !Array.isArray(response)
    ? response as JsonRecord
    : null;
  if (!record || record.success !== false) {
    return null;
  }
  return typeof record.error === 'string' && record.error.trim()
    ? record.error
    : fallback;
}

async function emitMemoryDiagnostic(
  input: ContextEnrichmentInput,
  diagnostic: Omit<MemoryRetrievalDiagnostic, 'conversationRef' | 'userId' | 'queryLength'>,
): Promise<void> {
  if (!input.emitDiagnostic) {
    return;
  }
  await input.emitDiagnostic({
    conversationRef: input.conversationRef,
    userId: input.userId,
    queryLength: input.text.length,
    ...diagnostic,
  });
}

async function emitTrace(input: ContextEnrichmentInput, event: TraceEventInput): Promise<void> {
  await input.emitTrace?.(event);
}

function nowMs(): number {
  return Date.now();
}

function durationSince(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

async function emitMemoryPersistenceDiagnostic(
  input: StoreCompletedTurnMemoryInput,
  diagnostic: Omit<
    MemoryPersistenceDiagnostic,
    'conversationRef' | 'userId' | 'userQueryLength' | 'assistantResponseLength'
  >,
): Promise<void> {
  if (!input.emitDiagnostic) {
    return;
  }
  await input.emitDiagnostic({
    conversationRef: input.conversationRef,
    userId: input.userId,
    userQueryLength: input.userQuery.trim().length,
    assistantResponseLength: input.assistantResponse.trim().length,
    ...diagnostic,
  });
}

export async function enrichQueryPayload(input: ContextEnrichmentInput): Promise<ContextEnrichmentResult> {
  const retrievalStartedAtMs = nowMs();
  await emitTrace(input, {
    path: 'memory.retrieval',
    stage: 'retrieval',
    status: 'started',
    data: {
      memoryRetrievalEnabled: input.memoryEnabled !== false && shouldRetrieveMemories(input.payload ?? {}),
      queryLength: input.text.length,
    },
  });
  const sourcePayload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? { ...input.payload }
    : {};
  if (Object.prototype.hasOwnProperty.call(sourcePayload, 'query_context')) {
    throw new Error('SDK query payload no longer accepts query_context');
  }
  if (Object.prototype.hasOwnProperty.call(sourcePayload, 'attachmentContext')) {
    throw new Error('SDK query payload no longer accepts attachmentContext');
  }
  const attachmentContext = typeof sourcePayload.attachment_context === 'string'
    ? sourcePayload.attachment_context
    : null;

  delete sourcePayload.attachment_context;
  delete sourcePayload.memory_retrieval_enabled;

  let memories = { episodic: [] as string[], semantic: [] as string[] };
  if (input.memoryEnabled === false) {
    await emitTrace(input, {
      path: 'memory.injection',
      stage: 'apply',
      status: 'skipped',
      data: {
        reason: 'memory_disabled',
      },
    });
    await emitTrace(input, {
      path: 'memory.retrieval',
      stage: 'retrieval',
      status: 'skipped',
      durationMs: durationSince(retrievalStartedAtMs),
      data: {
        reason: 'memory_disabled',
      },
    });
    return {
      payload: {
        ...sourcePayload,
        content: renderPlainModelFacingUserContent({
          text: input.text,
          attachmentContext,
        }),
      },
      memories,
    };
  }

  if (shouldRetrieveMemories(input.payload ?? {})) {
    if (!input.localRuntime?.rpc) {
      await emitMemoryDiagnostic(input, {
        stage: 'local_runtime_missing',
        message: 'Memory retrieval skipped because no local runtime RPC is available.',
      });
      await emitTrace(input, {
        path: MEMORY_LOCAL_RUNTIME_SEARCH_TRACE_PATH,
        stage: 'search',
        status: 'skipped',
        data: {
          reason: 'local_runtime_missing',
        },
      });
    } else {
      let embedding: Awaited<ReturnType<AgentHostedBackendClient['embeddings']['create']>> | null = null;
      const embeddingStartedAtMs = nowMs();
      try {
        await emitTrace(input, {
          path: 'memory.embedding',
          stage: 'request',
          status: 'started',
          data: {
            queryLength: input.text.length,
          },
        });
        embedding = await input.sdkClient.embeddings.create({ text: input.text });
        await emitTrace(input, {
          path: 'memory.embedding',
          stage: 'request',
          status: 'succeeded',
          durationMs: durationSince(embeddingStartedAtMs),
          data: {
            embeddingSpaceVersion: embedding.embedding_space_version,
            dimensions: Array.isArray(embedding.embedding) ? embedding.embedding.length : null,
          },
        });
      } catch (error) {
        await emitMemoryDiagnostic(input, {
          stage: 'embedding_request_failed',
          message: 'Memory retrieval skipped because the backend embedding request failed.',
          error: errorMessage(error),
        });
        await emitTrace(input, {
          path: 'memory.embedding',
          stage: 'request',
          status: 'failed',
          durationMs: durationSince(embeddingStartedAtMs),
          error,
        });
      }

      if (embedding) {
        const searchStartedAtMs = nowMs();
        try {
          await emitTrace(input, {
            path: MEMORY_LOCAL_RUNTIME_SEARCH_TRACE_PATH,
            stage: 'search',
            status: 'started',
            data: {
              embeddingSpaceVersion: embedding.embedding_space_version,
              combinedLimit: PROMPT_MEMORY_RETRIEVAL.combinedLimit,
              episodicLimit: PROMPT_MEMORY_RETRIEVAL.episodicLimit,
              semanticLimit: PROMPT_MEMORY_RETRIEVAL.semanticLimit,
              semanticMinScore: PROMPT_MEMORY_RETRIEVAL.semanticMinScore,
              excludeConversationId: input.conversationRef,
            },
          });
          const searchResult = await input.localRuntime.rpc({
            method: 'search_memory_by_embedding',
            params: {
              embedding: embedding.embedding,
              embedding_space_version: embedding.embedding_space_version,
              trace_context: input.traceContext ?? undefined,
              user_id: input.userId,
              limit: PROMPT_MEMORY_RETRIEVAL.combinedLimit,
              exclude_conversation_id: input.conversationRef,
              episodic_limit: PROMPT_MEMORY_RETRIEVAL.episodicLimit,
              semantic_limit: PROMPT_MEMORY_RETRIEVAL.semanticLimit,
              semantic_min_score: PROMPT_MEMORY_RETRIEVAL.semanticMinScore,
            },
          });
          const rpcError = rpcFailureMessage(searchResult, 'Memory search RPC failed');
          if (rpcError) {
            await emitMemoryDiagnostic(input, {
              stage: 'local_runtime_search_failed',
              message: 'Memory retrieval skipped because local runtime memory search failed.',
              error: rpcError,
            });
            await emitTrace(input, {
              path: MEMORY_LOCAL_RUNTIME_SEARCH_TRACE_PATH,
              stage: 'search',
              status: 'failed',
              durationMs: durationSince(searchStartedAtMs),
              error: { code: 'local_runtime_search_failed', message: rpcError },
            });
          } else {
            memories = normalizeMemories(searchResult);
            const searchTrace = normalizeMemorySearchTrace(searchResult);
            await emitTrace(input, {
              path: MEMORY_LOCAL_RUNTIME_SEARCH_TRACE_PATH,
              stage: 'search',
              status: 'succeeded',
              durationMs: durationSince(searchStartedAtMs),
              data: {
                ...searchTrace,
                episodicResultCount: memories.episodic.length,
                semanticResultCount: memories.semantic.length,
              },
            });
            if (memories.episodic.length === 0 && memories.semantic.length === 0) {
              await emitMemoryDiagnostic(input, {
                stage: 'search_empty',
                message: 'Memory retrieval completed with no matching memories.',
                episodicCount: 0,
                semanticCount: 0,
              });
            }
          }
        } catch (error) {
          await emitMemoryDiagnostic(input, {
            stage: 'local_runtime_search_failed',
            message: 'Memory retrieval skipped because local runtime memory search failed.',
            error: errorMessage(error),
          });
          await emitTrace(input, {
            path: MEMORY_LOCAL_RUNTIME_SEARCH_TRACE_PATH,
            stage: 'search',
            status: 'failed',
            durationMs: durationSince(searchStartedAtMs),
            error,
          });
        }
      }
    }
  }

  await emitTrace(input, {
    path: 'memory.injection',
    stage: 'apply',
    status: 'succeeded',
    data: {
      episodicResultCount: memories.episodic.length,
      semanticResultCount: memories.semantic.length,
    },
  });
  await emitTrace(input, {
    path: 'memory.retrieval',
    stage: 'retrieval',
    status: 'succeeded',
    durationMs: durationSince(retrievalStartedAtMs),
    data: {
      episodicResultCount: memories.episodic.length,
      semanticResultCount: memories.semantic.length,
    },
  });
  return {
    payload: {
      ...sourcePayload,
      content: renderModelFacingUserContent({
        text: input.text,
        memories,
        attachmentContext,
      }),
    },
    memories,
  };
}

type StoreCompletedTurnMemoryInput = {
  localRuntime?: AgentLocalRuntimeClient | null;
  sdkClient: AgentHostedBackendClient;
  userId: string;
  conversationRef: string;
  userQuery: string;
  assistantResponse: string;
  memoryEnabled?: boolean;
  emitDiagnostic?: (diagnostic: MemoryPersistenceDiagnostic) => void | Promise<void>;
};

export async function storeCompletedTurnMemory(
  input: StoreCompletedTurnMemoryInput,
): Promise<StoreCompletedTurnMemoryResult | null> {
  if (input.memoryEnabled === false) {
    await emitMemoryPersistenceDiagnostic(input, {
      stage: 'memory_disabled',
      message: 'Completed-turn memory storage skipped because SDK memory is disabled.',
    });
    return null;
  }
  if (!input.localRuntime?.rpc) {
    await emitMemoryPersistenceDiagnostic(input, {
      stage: 'local_runtime_missing',
      message: 'Completed-turn memory storage skipped because no local runtime RPC is available.',
    });
    return null;
  }
  if (!input.userQuery.trim() || !input.assistantResponse.trim()) {
    await emitMemoryPersistenceDiagnostic(input, {
      stage: 'content_empty',
      message: 'Completed-turn memory storage skipped because the user query or assistant response is empty.',
    });
    return null;
  }
  const content = formatCompletedTurnMemory({
    userQuery: input.userQuery,
    assistantResponse: input.assistantResponse,
  });
  let embedding: Awaited<ReturnType<AgentHostedBackendClient['embeddings']['create']>>;
  try {
    embedding = await input.sdkClient.embeddings.create({ text: content });
  } catch (error) {
    await emitMemoryPersistenceDiagnostic(input, {
      stage: 'embedding_request_failed',
      message: 'Completed-turn memory storage skipped because the backend embedding request failed.',
      error: errorMessage(error),
      contentLength: content.length,
      memoryType: 'episodic',
    });
    throw error;
  }
  const result = await input.localRuntime.rpc({
    method: 'store_memory_by_embedding',
    params: {
      user_id: input.userId,
      content,
      embedding: embedding.embedding,
      embedding_space_version: embedding.embedding_space_version,
      memory_type: 'episodic',
      conversation_id: input.conversationRef,
    },
  });
  const rpcError = rpcFailureMessage(result, 'Memory store RPC failed');
  if (rpcError) {
    await emitMemoryPersistenceDiagnostic(input, {
      stage: 'local_runtime_store_failed',
      message: 'Completed-turn memory storage failed because local runtime memory store failed.',
      error: rpcError,
      contentLength: content.length,
      memoryType: 'episodic',
    });
    throw new Error(rpcError);
  }
  const resultRecord = result && typeof result === 'object' && !Array.isArray(result)
    ? result as JsonRecord
    : {};
  const data = resultRecord.data && typeof resultRecord.data === 'object' && !Array.isArray(resultRecord.data)
    ? resultRecord.data as JsonRecord
    : {};
  const memoryId = typeof data.memory_id === 'string' ? data.memory_id : null;
  await emitMemoryPersistenceDiagnostic(input, {
    stage: 'store_succeeded',
    message: 'Completed-turn memory storage succeeded.',
    contentLength: content.length,
    memoryType: 'episodic',
    memoryId,
  });
  return { memoryId };
}
