"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationContinuityService = void 0;
const metadata_js_1 = require("../conversation/metadata.js");
function optionalString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
function toProviderHistoryMessage(message) {
    const role = message.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') {
        return null;
    }
    const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content ?? '');
    return {
        ...message,
        role,
        content,
    };
}
function toProviderHistoryMessages(messages) {
    return messages
        .map(toProviderHistoryMessage)
        .filter((message) => Boolean(message));
}
function stringByKeys(record, keys) {
    if (!record) {
        return null;
    }
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return null;
}
function metadataInvalidationFromLocalRuntimeEvent(event) {
    if (event.type !== 'conversation-title-updated') {
        return null;
    }
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
        ? event.payload
        : {};
    return {
        type: 'conversation-metadata-invalidated',
        reason: 'conversation-title-updated',
        conversationRef: stringByKeys(payload, ['conversation_id', 'conversationId', 'conversation_ref', 'conversationRef'])
            ?? stringByKeys(event, ['conversation_id', 'conversationId', 'conversation_ref', 'conversationRef']),
        title: stringByKeys(payload, ['title']) ?? stringByKeys(event, ['title']),
        source: stringByKeys(payload, ['source', 'title_source', 'titleSource'])
            ?? stringByKeys(event, ['source', 'title_source', 'titleSource']),
        rawEvent: event,
    };
}
class ConversationContinuityService {
    constructor(options) {
        this.options = options;
    }
    async listMetadata(input, options) {
        return this.storeFor(input).listMetadata(options);
    }
    async searchMetadata(input, options) {
        const store = this.storeFor(input);
        if (typeof store.searchMetadata === 'function') {
            return store.searchMetadata(options);
        }
        return (0, metadata_js_1.searchConversationMetadata)(await store.listMetadata(), options);
    }
    async loadForDisplay(input) {
        return this.storeFor(input).loadForDisplay(input.conversationRef);
    }
    async loadDisplayRows(input) {
        return this.storeFor(input).loadDisplayRows(input.conversationRef);
    }
    async loadRehydrateSnapshot(input) {
        return this.storeFor(input).loadForRehydrate(input.conversationRef);
    }
    async rehydrateFromStore(input) {
        const snapshot = await this.loadRehydrateSnapshot(input);
        const messages = toProviderHistoryMessages(snapshot.messages);
        if (messages.length === 0) {
            return {
                conversationRef: input.conversationRef,
                revisionId: snapshot.revisionId,
                messageCount: 0,
                hydrated: false,
                replayGenerationId: snapshot.replayGenerationId ?? null,
            };
        }
        const transport = this.options.transportFactory?.({
            workspacePath: input.workspacePath ?? null,
        });
        if (!transport) {
            throw new Error('Conversation continuity rehydrate requires a backend transport');
        }
        const payload = {
            conversation_ref: input.conversationRef,
            messages,
            rehydrate_mode: 'replace',
            workspace_path: optionalString(input.workspacePath),
        };
        await transport.rehydrateConversation(payload);
        return {
            conversationRef: input.conversationRef,
            revisionId: snapshot.revisionId,
            messageCount: messages.length,
            hydrated: true,
            replayGenerationId: snapshot.replayGenerationId ?? null,
        };
    }
    async replaceCompactedReplay(input) {
        await this.storeFor(input).replaceCompactedReplay(input.snapshot);
    }
    async deleteConversation(input) {
        const store = this.storeFor(input);
        if (typeof store.deleteConversation === 'function') {
            await store.deleteConversation(input.conversationRef);
            return;
        }
        throw new Error('Conversation continuity delete requires a deletable conversation store');
    }
    subscribeMetadataInvalidations(listener) {
        const source = this.options.localRuntimeEventSource;
        if (typeof source?.subscribeEvents !== 'function') {
            return () => { };
        }
        return source.subscribeEvents((event) => {
            const invalidation = metadataInvalidationFromLocalRuntimeEvent(event);
            if (invalidation) {
                listener(invalidation);
            }
        });
    }
    storeFor(input) {
        return this.options.storeFactory({ userId: input.userId });
    }
}
exports.ConversationContinuityService = ConversationContinuityService;
