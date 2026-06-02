"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderModelFacingUserContent = renderModelFacingUserContent;
exports.renderPlainModelFacingUserContent = renderPlainModelFacingUserContent;
exports.formatCompletedTurnMemory = formatCompletedTurnMemory;
exports.enrichQueryPayload = enrichQueryPayload;
exports.storeCompletedTurnMemory = storeCompletedTurnMemory;
const PROMPT_MEMORY_RETRIEVAL = Object.freeze({
    combinedLimit: 6,
    episodicLimit: 4,
    semanticLimit: 2,
    semanticMinScore: 0.2,
});
function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function stringEntries(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => typeof entry === 'string');
}
function formatMemorySection(tagName, entries) {
    if (entries.length === 0) {
        return `<${tagName}>\nNone\n</${tagName}>`;
    }
    return `<${tagName}>\n${entries.map(entry => `- ${escapeXml(entry)}`).join('\n')}\n</${tagName}>`;
}
function renderModelFacingUserContent(input) {
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
function renderPlainModelFacingUserContent(input) {
    const parts = [];
    if (typeof input.attachmentContext === 'string' && input.attachmentContext.trim()) {
        parts.push(`<attached_file_context>\n${escapeXml(input.attachmentContext.trim())}\n</attached_file_context>`);
    }
    parts.push(`<user_query>\n${escapeXml(input.text)}\n</user_query>`);
    return parts.join('\n\n');
}
function formatCompletedTurnMemory(input) {
    return `User: ${input.userQuery.trim()}\nAssistant: ${input.assistantResponse.trim()}`;
}
function normalizeMemories(response) {
    const record = response && typeof response === 'object' && !Array.isArray(response)
        ? response
        : {};
    const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
        ? record.data
        : {};
    const memories = data.memories && typeof data.memories === 'object' && !Array.isArray(data.memories)
        ? data.memories
        : {};
    return {
        episodic: stringEntries(memories.episodic),
        semantic: stringEntries(memories.semantic),
    };
}
function shouldRetrieveMemories(payload) {
    return payload.memory_retrieval_enabled !== false;
}
async function enrichQueryPayload(input) {
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
    let memories = { episodic: [], semantic: [] };
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
        }
        catch {
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
async function storeCompletedTurnMemory(input) {
    if (input.memoryEnabled === false
        || !input.localRuntime?.rpc
        || !input.userQuery.trim()
        || !input.assistantResponse.trim()) {
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
    if (result
        && typeof result === 'object'
        && !Array.isArray(result)
        && result.success === false) {
        const error = result.error;
        throw new Error(typeof error === 'string' ? error : 'Memory store RPC failed');
    }
}
