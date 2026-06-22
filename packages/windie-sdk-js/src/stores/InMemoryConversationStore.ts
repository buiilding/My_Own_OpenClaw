/**
 * Stores and retrieves in memory conversation state for the TypeScript SDK runtime.
 */

import type {
  CompactedReplaySnapshot,
  ConversationEvent,
  ConversationMetadata,
  ConversationRevision,
  ConversationRewritePlan,
  ConversationStore,
  DisplayConversation,
  ListConversationOptions,
  ModelHistoryCheckpoint,
  RehydrateSnapshot,
  SdkDisplayRow,
  SearchConversationOptions,
} from '../conversation/types.js';
import {
  applyConversationMetadataPagination,
  searchConversationMetadata,
} from '../conversation/metadata.js';
import {
  buildDisplayConversation,
  buildDisplayRows,
  buildRehydrateSnapshot,
} from '../projections/conversationProjections.js';
import { latestCompactedReplayFromEvents } from './compactedReplayEvents.js';

function lastTextEvent(events: ConversationEvent[]): ConversationEvent | undefined {
  return [...events].reverse().find(event => {
    if (event.type === 'user_message' || event.type === 'assistant_message') {
      return typeof event.payload.text === 'string' || typeof event.payload.content === 'string';
    }
    return false;
  });
}

function eventText(event: ConversationEvent | undefined): string | null {
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

export class InMemoryConversationStore implements ConversationStore {
  private readonly eventsByConversation = new Map<string, ConversationEvent[]>();
  private readonly eventIdsByConversation = new Map<string, Set<string>>();
  private readonly revisionsByConversation = new Map<string, ConversationRevision>();
  private readonly replayByConversation = new Map<string, CompactedReplaySnapshot>();
  private readonly modelHistoryByConversation = new Map<string, ModelHistoryCheckpoint[]>();

  async appendEvent(event: ConversationEvent): Promise<void> {
    await this.appendEvents([event]);
  }

  async appendEvents(events: ConversationEvent[]): Promise<void> {
    for (const event of events) {
      const knownIds = this.eventIdsByConversation.get(event.conversationRef) ?? new Set<string>();
      if (knownIds.has(event.eventId)) {
        continue;
      }
      knownIds.add(event.eventId);
      this.eventIdsByConversation.set(event.conversationRef, knownIds);
      const existing = this.eventsByConversation.get(event.conversationRef) ?? [];
      existing.push(event);
      this.eventsByConversation.set(event.conversationRef, existing);
      this.revisionsByConversation.set(event.conversationRef, {
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        updatedAt: event.timestamp,
      });
    }
  }

  async rewriteConversation(plan: ConversationRewritePlan): Promise<void> {
    const rewritten = [...plan.preservedEvents];
    this.eventsByConversation.set(plan.conversationRef, rewritten);
    this.eventIdsByConversation.set(
      plan.conversationRef,
      new Set(rewritten.map(event => event.eventId)),
    );
    this.revisionsByConversation.set(plan.conversationRef, {
      conversationRef: plan.conversationRef,
      revisionId: plan.newRevisionId,
      updatedAt: new Date().toISOString(),
    });
  }

  async replaceCompactedReplay(snapshot: CompactedReplaySnapshot): Promise<void> {
    if (!snapshot.complete || snapshot.entryCount !== snapshot.entries.length) {
      return;
    }
    this.replayByConversation.set(snapshot.conversationRef, {
      ...snapshot,
      active: true,
    });
  }

  async loadEvents(conversationRef: string): Promise<ConversationEvent[]> {
    return [...(this.eventsByConversation.get(conversationRef) ?? [])];
  }

  async loadForDisplay(conversationRef: string): Promise<DisplayConversation> {
    return buildDisplayConversation(await this.loadEvents(conversationRef));
  }

  async loadDisplayRows(conversationRef: string): Promise<SdkDisplayRow[]> {
    return buildDisplayRows(await this.loadEvents(conversationRef));
  }

  async loadForRehydrate(conversationRef: string): Promise<RehydrateSnapshot> {
    const compactedReplay = await this.loadCompactedReplay(conversationRef);
    if (
      compactedReplay?.complete
      && compactedReplay.active !== false
      && compactedReplay.entryCount === compactedReplay.entries.length
    ) {
      return {
        conversationRef,
        revisionId: compactedReplay.sourceRevisionId,
        messages: compactedReplay.entries,
        replayGenerationId: compactedReplay.generationId,
      };
    }
    return buildRehydrateSnapshot(await this.loadEvents(conversationRef));
  }

  async replaceModelHistory(checkpoint: ModelHistoryCheckpoint): Promise<void> {
    const existing = this.modelHistoryByConversation.get(checkpoint.conversationRef) ?? [];
    const next = [
      ...existing.filter(entry => !(
        entry.revisionId === checkpoint.revisionId
        && entry.checkpointId === checkpoint.checkpointId
      )),
      {
        ...checkpoint,
        rows: [...checkpoint.rows],
      },
    ];
    this.modelHistoryByConversation.set(checkpoint.conversationRef, next);
  }

  async loadModelHistory(input: {
    conversationRef: string;
    revisionId?: string | null;
  }): Promise<ModelHistoryCheckpoint | null> {
    const checkpoints = this.modelHistoryByConversation.get(input.conversationRef) ?? [];
    const candidates = input.revisionId
      ? checkpoints.filter(checkpoint => checkpoint.revisionId === input.revisionId)
      : checkpoints;
    const latest = [...candidates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    return latest ? { ...latest, rows: [...latest.rows] } : null;
  }

  async listMetadata(options: ListConversationOptions = {}): Promise<ConversationMetadata[]> {
    const metadata = Array.from(this.eventsByConversation.entries()).map(([conversationRef, events]) => {
      const revision = this.revisionsByConversation.get(conversationRef);
      const lastEvent = [...events].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
      return {
        conversationRef,
        revisionId: revision?.revisionId ?? lastEvent?.revisionId ?? 'rev-missing',
        title: eventText(events.find(event => event.type === 'user_message')) ?? conversationRef,
        lastMessage: eventText(lastTextEvent(events)),
        updatedAt: revision?.updatedAt ?? lastEvent?.timestamp ?? new Date(0).toISOString(),
        eventCount: events.length,
      };
    }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return applyConversationMetadataPagination(metadata, options);
  }

  async searchMetadata(options: SearchConversationOptions): Promise<ConversationMetadata[]> {
    return searchConversationMetadata(await this.listMetadata(), options);
  }

  async deleteConversation(conversationRef: string): Promise<void> {
    this.eventsByConversation.delete(conversationRef);
    this.eventIdsByConversation.delete(conversationRef);
    this.revisionsByConversation.delete(conversationRef);
    this.replayByConversation.delete(conversationRef);
    this.modelHistoryByConversation.delete(conversationRef);
  }

  async clearConversations(): Promise<void> {
    this.eventsByConversation.clear();
    this.eventIdsByConversation.clear();
    this.revisionsByConversation.clear();
    this.replayByConversation.clear();
    this.modelHistoryByConversation.clear();
  }

  async getRevision(conversationRef: string): Promise<ConversationRevision> {
    const revision = this.revisionsByConversation.get(conversationRef);
    if (revision) {
      return revision;
    }
    return {
      conversationRef,
      revisionId: 'rev-empty',
      updatedAt: new Date(0).toISOString(),
    };
  }

  async loadCompactedReplay(conversationRef: string): Promise<CompactedReplaySnapshot | null> {
    return this.replayByConversation.get(conversationRef)
      ?? latestCompactedReplayFromEvents(await this.loadEvents(conversationRef));
  }
}
