"use strict";
/**
 * Implements the conversation continuity service service for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationContinuityService = void 0;
exports.conversationMetadataInvalidationFromLocalRuntimeEvent = conversationMetadataInvalidationFromLocalRuntimeEvent;
const metadata_js_1 = require("../conversation/metadata.js");
const modelHistoryPayload_js_1 = require("./modelHistoryPayload.js");
function optionalString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
function conversationMetadataInvalidationFromLocalRuntimeEvent(event) {
    if (event.type !== 'conversation-title-updated') {
        return null;
    }
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
        ? event.payload
        : {};
    return {
        type: 'conversation-metadata-invalidated',
        reason: 'conversation-title-updated',
        conversationRef: optionalString(payload.conversation_id),
        title: optionalString(payload.title),
        source: optionalString(payload.source),
        sourceEvent: event,
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
        const store = this.storeFor(input);
        const revision = await Promise.resolve(store.getRevision(input.conversationRef)).catch(() => null);
        const revisionId = revision?.revisionId && revision.revisionId !== 'rev-empty'
            ? revision.revisionId
            : null;
        const modelHistoryCheckpoint = store.loadModelHistory
            ? await store.loadModelHistory.call(store, {
                conversationRef: input.conversationRef,
                revisionId,
            })
            : null;
        if (modelHistoryCheckpoint && modelHistoryCheckpoint.rows.length > 0) {
            const transport = this.options.transportFactory?.({
                workspacePath: input.workspacePath ?? null,
            });
            if (!transport) {
                throw new Error('Conversation continuity rehydrate requires an agent runtime transport');
            }
            await transport.rehydrateConversation({
                conversation_ref: input.conversationRef,
                messages: [],
                model_history: (0, modelHistoryPayload_js_1.modelHistoryPayloadFromCheckpoint)(modelHistoryCheckpoint),
                rehydrate_mode: 'replace',
                workspace_path: optionalString(input.workspacePath),
            });
            return {
                conversationRef: input.conversationRef,
                revisionId: modelHistoryCheckpoint.revisionId,
                messageCount: modelHistoryCheckpoint.rows.length,
                hydrated: true,
                replayGenerationId: null,
                modelHistoryCheckpointId: modelHistoryCheckpoint.checkpointId,
                source: 'model_history',
            };
        }
        return {
            conversationRef: input.conversationRef,
            revisionId: revisionId ?? 'rev-empty',
            messageCount: 0,
            hydrated: false,
            replayGenerationId: null,
            modelHistoryCheckpointId: null,
            source: 'missing_model_history',
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
            const invalidation = conversationMetadataInvalidationFromLocalRuntimeEvent(event);
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
