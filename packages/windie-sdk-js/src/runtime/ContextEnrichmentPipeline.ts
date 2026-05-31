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
  if (shouldRetrieveMemories(input.payload ?? {}) && input.localRuntime?.rpc) {
    try {
      const embedding = await input.sdkClient.embeddings.create({ text: input.text });
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
      memories = normalizeMemories(searchResult);
    } catch {
      memories = { episodic: [], semantic: [] };
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
  userId: string;
  conversationRef: string;
  userQuery: string;
  assistantResponse: string;
}): Promise<void> {
  if (!input.localRuntime?.rpc || !input.userQuery.trim() || !input.assistantResponse.trim()) {
    return;
  }
  await input.localRuntime.rpc({
    method: 'store_memory',
    params: {
      user_id: input.userId,
      user_query: input.userQuery,
      assistant_response: input.assistantResponse,
      memory_type: 'episodic',
      session_id: input.conversationRef,
    },
  });
}
