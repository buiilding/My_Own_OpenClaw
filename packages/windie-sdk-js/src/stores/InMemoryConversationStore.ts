import type {
  CompactedReplaySnapshot,
  ConversationEvent,
  ConversationMetadata,
  ConversationRevision,
  ConversationRewritePlan,
  ConversationStore,
  ListConversationOptions,
} from '../conversation/types.js';

function sortEvents(events: ConversationEvent[]): ConversationEvent[] {
  return [...events].sort((a, b) => {
    const timeDiff = Date.parse(a.timestamp) - Date.parse(b.timestamp);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.eventId.localeCompare(b.eventId);
  });
}

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
      this.eventsByConversation.set(event.conversationRef, sortEvents(existing));
      this.revisionsByConversation.set(event.conversationRef, {
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        updatedAt: event.timestamp,
      });
    }
  }

  async rewriteConversation(plan: ConversationRewritePlan): Promise<void> {
    const rewritten = sortEvents(plan.preservedEvents);
    this.eventsByConversation.set(plan.conversationRef, sortEvents(rewritten));
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
    return sortEvents(this.eventsByConversation.get(conversationRef) ?? []);
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
    return typeof options.limit === 'number' ? metadata.slice(0, options.limit) : metadata;
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
    return this.replayByConversation.get(conversationRef) ?? null;
  }
}
