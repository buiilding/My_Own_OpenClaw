import type { JsonRecord } from '../conversation/types.js';
import type { WindieSdkClient } from '../transport/HostedBackendHttpClient.js';
import type { WindieLocalRuntimeClient } from './LocalSidecarRuntime.js';

const PROMPT_MEMORY_RETRIEVAL = Object.freeze({
  combinedLimit: 6,
  episodicLimit: 4,
  semanticLimit: 2,
  semanticMinScore: 0.2,
});

export type ContextEnrichmentInput = {
  text: string;
  conversationRef: string;
  userId: string;
  payload?: JsonRecord | null;
  sdkClient: WindieSdkClient;
  localRuntime?: WindieLocalRuntimeClient | null;
  memoryEnabled?: boolean;
  emitDiagnostic?: (diagnostic: MemoryRetrievalDiagnostic) => void | Promise<void>;
};

export type MemoryRetrievalDiagnosticStage =
  | 'local_runtime_missing'
  | 'embedding_request_failed'
  | 'sidecar_search_failed'
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

export type ContextEnrichmentResult = {
  payload: JsonRecord;
  memories: {
    episodic: string[];
    semantic: string[];
  };
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

export function renderModelFacingUserContent(input: {
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

export function renderPlainModelFacingUserContent(input: {
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

function rpcFailureMessage(response: unknown): string | null {
  const record = response && typeof response === 'object' && !Array.isArray(response)
    ? response as JsonRecord
    : null;
  if (!record || record.success !== false) {
    return null;
  }
  return typeof record.error === 'string' && record.error.trim()
    ? record.error
    : 'Memory search RPC failed';
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

export async function enrichQueryPayload(input: ContextEnrichmentInput): Promise<ContextEnrichmentResult> {
  const sourcePayload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? { ...input.payload }
    : {};
  const attachmentContext = typeof sourcePayload.attachment_context === 'string'
    ? sourcePayload.attachment_context
    : (typeof sourcePayload.attachmentContext === 'string' ? sourcePayload.attachmentContext : null);

  delete sourcePayload.query_context;
  delete sourcePayload.attachment_context;
  delete sourcePayload.attachmentContext;
  delete sourcePayload.memory_retrieval_enabled;

  let memories = { episodic: [] as string[], semantic: [] as string[] };
  if (input.memoryEnabled === false) {
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
    } else {
      let embedding: Awaited<ReturnType<WindieSdkClient['embeddings']['create']>> | null = null;
      try {
        embedding = await input.sdkClient.embeddings.create({ text: input.text });
      } catch (error) {
        await emitMemoryDiagnostic(input, {
          stage: 'embedding_request_failed',
          message: 'Memory retrieval skipped because the backend embedding request failed.',
          error: errorMessage(error),
        });
      }

      if (embedding) {
        try {
          const searchResult = await input.localRuntime.rpc({
            method: 'search_memory_by_embedding',
            params: {
              embedding: embedding.embedding,
              embedding_space_version: embedding.embedding_space_version,
              user_id: input.userId,
              limit: PROMPT_MEMORY_RETRIEVAL.combinedLimit,
              exclude_conversation_id: input.conversationRef,
              episodic_limit: PROMPT_MEMORY_RETRIEVAL.episodicLimit,
              semantic_limit: PROMPT_MEMORY_RETRIEVAL.semanticLimit,
              semantic_min_score: PROMPT_MEMORY_RETRIEVAL.semanticMinScore,
            },
          });
          const rpcError = rpcFailureMessage(searchResult);
          if (rpcError) {
            await emitMemoryDiagnostic(input, {
              stage: 'sidecar_search_failed',
              message: 'Memory retrieval skipped because sidecar memory search failed.',
              error: rpcError,
            });
          } else {
            memories = normalizeMemories(searchResult);
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
            stage: 'sidecar_search_failed',
            message: 'Memory retrieval skipped because sidecar memory search failed.',
            error: errorMessage(error),
          });
        }
      }
    }
  }

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

export async function storeCompletedTurnMemory(input: {
  localRuntime?: WindieLocalRuntimeClient | null;
  sdkClient: WindieSdkClient;
  userId: string;
  conversationRef: string;
  userQuery: string;
  assistantResponse: string;
  memoryEnabled?: boolean;
}): Promise<void> {
  if (
    input.memoryEnabled === false
    || !input.localRuntime?.rpc
    || !input.userQuery.trim()
    || !input.assistantResponse.trim()
  ) {
    return;
  }
  const content = formatCompletedTurnMemory({
    userQuery: input.userQuery,
    assistantResponse: input.assistantResponse,
  });
  const embedding = await input.sdkClient.embeddings.create({ text: content });
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
  if (
    result
    && typeof result === 'object'
    && !Array.isArray(result)
    && (result as JsonRecord).success === false
  ) {
    const error = (result as JsonRecord).error;
    throw new Error(typeof error === 'string' ? error : 'Memory store RPC failed');
  }
}
