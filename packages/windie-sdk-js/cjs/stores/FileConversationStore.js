"use strict";
/**
 * Stores and retrieves file conversation state for the TypeScript SDK runtime.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileConversationStore = void 0;
const metadata_js_1 = require("../conversation/metadata.js");
const conversationProjections_js_1 = require("../projections/conversationProjections.js");
const compactedReplayEvents_js_1 = require("./compactedReplayEvents.js");
async function importNodeModule(specifier) {
    return Promise.resolve(`${specifier}`).then(s => __importStar(require(s)));
}
async function loadNodeFileModules() {
    const [fs, path] = await Promise.all([
        importNodeModule('node:fs/promises'),
        importNodeModule('node:path'),
    ]);
    return { fs, path };
}
function conversationFilename(conversationRef) {
    return `${encodeURIComponent(conversationRef)}.json`;
}
function isConversationEvent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const event = value;
    return typeof event.eventId === 'string'
        && typeof event.type === 'string'
        && typeof event.conversationRef === 'string'
        && typeof event.revisionId === 'string'
        && typeof event.timestamp === 'string'
        && typeof event.source === 'string'
        && Boolean(event.payload)
        && typeof event.payload === 'object'
        && !Array.isArray(event.payload);
}
function eventText(event) {
    if (!event) {
        return null;
    }
    if (typeof event.payload.text === 'string') {
        return event.payload.text;
    }
    if (typeof event.payload.content === 'string') {
        return event.payload.content;
    }
    return null;
}
function lastTextEvent(events) {
    return [...events].reverse().find(event => ((event.type === 'user_message' || event.type === 'assistant_message')
        && (typeof event.payload.text === 'string' || typeof event.payload.content === 'string')));
}
function buildRevision(conversationRef, events) {
    const lastEvent = events[events.length - 1];
    return {
        conversationRef,
        revisionId: lastEvent?.revisionId ?? 'rev-empty',
        updatedAt: lastEvent?.timestamp ?? new Date(0).toISOString(),
    };
}
function normalizeStoredFile(conversationRef, raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            version: 1,
            conversationRef,
            events: [],
            replay: null,
            revision: buildRevision(conversationRef, []),
        };
    }
    const payload = raw;
    const events = Array.isArray(payload.events)
        ? payload.events.filter(isConversationEvent)
        : [];
    return {
        version: 1,
        conversationRef: typeof payload.conversationRef === 'string'
            ? payload.conversationRef
            : conversationRef,
        events,
        replay: payload.replay ?? null,
        modelHistory: Array.isArray(payload.modelHistory)
            ? payload.modelHistory
            : [],
        displayTimeline: Array.isArray(payload.displayTimeline)
            ? payload.displayTimeline
            : [],
        revision: payload.revision ?? buildRevision(conversationRef, events),
    };
}
class FileConversationStore {
    constructor(options) {
        this.options = options;
        this.conversationMutationChains = new Map();
    }
    async appendEvent(event) {
        await this.appendEvents([event]);
    }
    async appendEvents(events) {
        const groupedEvents = new Map();
        for (const event of events) {
            const group = groupedEvents.get(event.conversationRef) ?? [];
            group.push(event);
            groupedEvents.set(event.conversationRef, group);
        }
        for (const [conversationRef, nextEvents] of groupedEvents) {
            await this.runConversationMutation(conversationRef, async () => {
                const stored = await this.readConversation(conversationRef);
                const knownIds = new Set(stored.events.map(event => event.eventId));
                const uniqueNextEvents = nextEvents.filter(event => {
                    if (knownIds.has(event.eventId)) {
                        return false;
                    }
                    knownIds.add(event.eventId);
                    return true;
                });
                const merged = [
                    ...stored.events,
                    ...uniqueNextEvents,
                ];
                await this.writeConversation({
                    ...stored,
                    conversationRef,
                    events: merged,
                    revision: buildRevision(conversationRef, merged),
                });
            });
        }
    }
    async rewriteConversation(plan) {
        await this.runConversationMutation(plan.conversationRef, async () => {
            const events = [...plan.preservedEvents];
            const stored = await this.readConversation(plan.conversationRef);
            await this.writeConversation({
                ...stored,
                conversationRef: plan.conversationRef,
                events,
                revision: {
                    conversationRef: plan.conversationRef,
                    revisionId: plan.newRevisionId,
                    updatedAt: new Date().toISOString(),
                },
            });
        });
    }
    async replaceCompactedReplay(snapshot) {
        if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
            return;
        }
        await this.runConversationMutation(snapshot.conversationRef, async () => {
            const stored = await this.readConversation(snapshot.conversationRef);
            await this.writeConversation({
                ...stored,
                conversationRef: snapshot.conversationRef,
                replay: {
                    ...snapshot,
                    active: true,
                },
            });
        });
    }
    async loadEvents(conversationRef) {
        return (await this.readConversation(conversationRef)).events;
    }
    async loadForDisplay(conversationRef) {
        return (0, conversationProjections_js_1.buildDisplayConversation)(await this.loadEvents(conversationRef));
    }
    async loadDisplayRows(conversationRef) {
        return (0, conversationProjections_js_1.buildDisplayRows)(await this.loadEvents(conversationRef));
    }
    async replaceDisplayTimeline(checkpoint) {
        await this.runConversationMutation(checkpoint.conversationRef, async () => {
            const stored = await this.readConversation(checkpoint.conversationRef);
            const existing = stored.displayTimeline ?? [];
            await this.writeConversation({
                ...stored,
                conversationRef: checkpoint.conversationRef,
                displayTimeline: [
                    ...existing.filter(entry => entry.revisionId !== checkpoint.revisionId),
                    {
                        ...checkpoint,
                        rows: [...checkpoint.rows],
                    },
                ],
                revision: {
                    conversationRef: checkpoint.conversationRef,
                    revisionId: checkpoint.revisionId,
                    updatedAt: checkpoint.createdAt,
                },
            });
        });
    }
    async loadDisplayTimeline(input) {
        const stored = await this.readConversation(input.conversationRef);
        const checkpoints = stored.displayTimeline ?? [];
        const candidates = input.revisionId
            ? checkpoints.filter(checkpoint => checkpoint.revisionId === input.revisionId)
            : checkpoints;
        const latest = [...candidates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        return latest ? { ...latest, rows: [...latest.rows] } : null;
    }
    async loadForRehydrate(conversationRef) {
        const compactedReplay = await this.loadCompactedReplay(conversationRef);
        if (compactedReplay?.complete
            && compactedReplay.active !== false
            && compactedReplay.entryCount === compactedReplay.entries.length) {
            return {
                conversationRef,
                revisionId: compactedReplay.sourceRevisionId,
                messages: compactedReplay.entries,
                replayGenerationId: compactedReplay.generationId,
            };
        }
        return (0, conversationProjections_js_1.buildRehydrateSnapshot)(await this.loadEvents(conversationRef));
    }
    async replaceModelHistory(checkpoint) {
        await this.runConversationMutation(checkpoint.conversationRef, async () => {
            const stored = await this.readConversation(checkpoint.conversationRef);
            const existing = stored.modelHistory ?? [];
            await this.writeConversation({
                ...stored,
                conversationRef: checkpoint.conversationRef,
                modelHistory: [
                    ...existing.filter(entry => !(entry.revisionId === checkpoint.revisionId
                        && entry.checkpointId === checkpoint.checkpointId)),
                    {
                        ...checkpoint,
                        rows: [...checkpoint.rows],
                    },
                ],
            });
        });
    }
    async loadModelHistory(input) {
        const stored = await this.readConversation(input.conversationRef);
        const checkpoints = stored.modelHistory ?? [];
        const candidates = input.revisionId
            ? checkpoints.filter(checkpoint => checkpoint.revisionId === input.revisionId)
            : checkpoints;
        const latest = [...candidates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        return latest ? { ...latest, rows: [...latest.rows] } : null;
    }
    async listMetadata(options = {}) {
        const { fs } = await this.modules();
        await this.ensureDirectory();
        const files = await fs.readdir(this.options.directory);
        const metadata = [];
        for (const file of files) {
            if (!file.endsWith('.json')) {
                continue;
            }
            const conversationRef = decodeURIComponent(file.slice(0, -5));
            const stored = await this.readConversation(conversationRef);
            const revision = stored.revision ?? buildRevision(conversationRef, stored.events);
            metadata.push({
                conversationRef,
                revisionId: revision.revisionId,
                title: eventText(stored.events.find(event => event.type === 'user_message')) ?? conversationRef,
                lastMessage: eventText(lastTextEvent(stored.events)),
                updatedAt: revision.updatedAt,
                eventCount: stored.events.length,
            });
        }
        const sorted = metadata.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        return (0, metadata_js_1.applyConversationMetadataPagination)(sorted, options);
    }
    async searchMetadata(options) {
        return (0, metadata_js_1.searchConversationMetadata)(await this.listMetadata(), options);
    }
    async deleteConversation(conversationRef) {
        await this.runConversationMutation(conversationRef, async () => {
            const { fs } = await this.modules();
            try {
                await fs.unlink(await this.filePath(conversationRef));
            }
            catch (error) {
                const code = error?.code;
                if (code !== 'ENOENT') {
                    throw error;
                }
            }
        });
    }
    async clearConversations() {
        const { fs, path } = await this.modules();
        await this.ensureDirectory();
        const files = await fs.readdir(this.options.directory);
        await Promise.all(files
            .filter(file => file.endsWith('.json'))
            .map(file => fs.unlink(path.join(this.options.directory, file))));
        this.conversationMutationChains.clear();
    }
    async getRevision(conversationRef) {
        const stored = await this.readConversation(conversationRef);
        return stored.revision ?? buildRevision(conversationRef, stored.events);
    }
    async loadCompactedReplay(conversationRef) {
        const stored = await this.readConversation(conversationRef);
        return stored.replay ?? (0, compactedReplayEvents_js_1.latestCompactedReplayFromEvents)(stored.events);
    }
    async modules() {
        this.modulesPromise ?? (this.modulesPromise = loadNodeFileModules());
        return this.modulesPromise;
    }
    async ensureDirectory() {
        const { fs } = await this.modules();
        await fs.mkdir(this.options.directory, { recursive: true });
    }
    async filePath(conversationRef) {
        const { path } = await this.modules();
        return path.join(this.options.directory, conversationFilename(conversationRef));
    }
    async runConversationMutation(conversationRef, operation) {
        const previous = this.conversationMutationChains.get(conversationRef) ?? Promise.resolve();
        let releaseCurrent = () => { };
        const current = new Promise((resolve) => {
            releaseCurrent = resolve;
        });
        const chain = previous.catch(() => undefined).then(() => current);
        this.conversationMutationChains.set(conversationRef, chain);
        await previous.catch(() => undefined);
        try {
            return await operation();
        }
        finally {
            releaseCurrent();
            if (this.conversationMutationChains.get(conversationRef) === chain) {
                this.conversationMutationChains.delete(conversationRef);
            }
        }
    }
    async readConversation(conversationRef) {
        const { fs } = await this.modules();
        await this.ensureDirectory();
        try {
            const content = await fs.readFile(await this.filePath(conversationRef), 'utf8');
            return normalizeStoredFile(conversationRef, JSON.parse(content));
        }
        catch (error) {
            const code = error?.code;
            if (code === 'ENOENT') {
                return normalizeStoredFile(conversationRef, null);
            }
            throw error;
        }
    }
    async writeConversation(file) {
        const { fs } = await this.modules();
        await this.ensureDirectory();
        const target = await this.filePath(file.conversationRef);
        const temporary = `${target}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
        await fs.writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
        await fs.rename(temporary, target);
    }
}
exports.FileConversationStore = FileConversationStore;
