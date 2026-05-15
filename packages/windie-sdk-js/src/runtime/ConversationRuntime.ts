import { createConversationEvent, createRuntimeId } from '../conversation/events.js';
import { isBackendEvent } from '../backendEvents.js';
import type {
  BackendTransport,
  CompactedReplaySnapshot,
  ConversationEvent,
  ConversationRuntimeState,
  ConversationStore,
  DisplayConversation,
  JsonRecord,
  RehydrateSnapshot,
} from '../conversation/types.js';
import {
  buildDisplayConversation,
  buildRehydrateSnapshot,
} from '../projections/conversationProjections.js';
import { normalizeBackendEventToConversationEvent } from '../transport/backendEventNormalizer.js';
import { reduceConversationRuntimeState, createInitialConversationRuntimeState } from './conversationReducer.js';

export type ConversationListener = (snapshot: ConversationSnapshot) => void;

export type ConversationSnapshot = {
  state: ConversationRuntimeState;
  display: DisplayConversation;
  rehydrate: RehydrateSnapshot;
};

export type SendInput = {
  text: string;
  turnRef?: string;
  payload?: JsonRecord;
};

export type TurnResult = {
  turnRef: string;
  queryMessageId: string;
};

export type EditAndResendInput = {
  messageId: string;
  text: string;
  turnRef?: string;
  payload?: JsonRecord;
};

export type RetryTurnInput = {
  messageId?: string;
  turnRef?: string;
  payload?: JsonRecord;
};

function eventText(event: ConversationEvent): string {
  if (typeof event.payload.text === 'string') {
    return event.payload.text;
  }
  if (typeof event.payload.content === 'string') {
    return event.payload.content;
  }
  return '';
}

function eventMatchesId(event: ConversationEvent, messageId: string): boolean {
  return event.eventId === messageId
    || event.payload.id === messageId
    || event.payload.messageId === messageId
    || event.payload.message_id === messageId;
}

function isCompleteReplaySnapshot(snapshot: CompactedReplaySnapshot | null): snapshot is CompactedReplaySnapshot {
  return Boolean(
    snapshot
    && snapshot.complete
    && snapshot.active !== false
    && snapshot.entryCount === snapshot.entries.length,
  );
}

export class SdkConversationRuntime {
  private state: ConversationRuntimeState;
  private readonly listeners = new Set<ConversationListener>();
  private detachTransport?: () => void;

  constructor(
    private readonly options: {
      conversationRef: string;
      revisionId?: string;
      store: ConversationStore;
      transport?: BackendTransport;
    },
  ) {
    this.state = createInitialConversationRuntimeState(
      options.conversationRef,
      options.revisionId,
    );
  }

  async load(): Promise<ConversationSnapshot> {
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    this.state = events.reduce(
      (state, event) => reduceConversationRuntimeState(state, event),
      createInitialConversationRuntimeState(
        this.options.conversationRef,
        events[events.length - 1]?.revisionId ?? this.state.revisionId,
      ),
    );
    return this.snapshot(events);
  }

  subscribe(listener: ConversationListener): () => void {
    this.listeners.add(listener);
    void this.load().then(snapshot => listener(snapshot));
    return () => {
      this.listeners.delete(listener);
    };
  }

  attachTransport(): void {
    if (!this.options.transport || this.detachTransport) {
      return;
    }
    this.detachTransport = this.options.transport.subscribe(rawEvent => {
      if (!isBackendEvent(rawEvent)) {
        return;
      }
      const event = normalizeBackendEventToConversationEvent(rawEvent, {
        fallbackConversationRef: this.options.conversationRef,
        fallbackRevisionId: this.state.revisionId,
      });
      if (event) {
        void this.applyEvent(event);
      }
    });
  }

  async send(input: SendInput): Promise<TurnResult> {
    const turnRef = input.turnRef ?? createRuntimeId('turn');
    const revisionId = this.state.revisionId === 'rev-empty'
      ? createRuntimeId('rev')
      : this.state.revisionId;
    await this.applyEvent(createConversationEvent({
      type: 'turn_started',
      conversationRef: this.options.conversationRef,
      revisionId,
      turnRef,
      source: 'sdk',
      payload: {},
    }));
    await this.applyEvent(createConversationEvent({
      type: 'user_message',
      conversationRef: this.options.conversationRef,
      revisionId,
      turnRef,
      source: 'ui',
      payload: {
        ...(input.payload ?? {}),
        text: input.text,
      },
    }));
    const queryMessageId = await this.options.transport?.sendQuery({
      ...(input.payload ?? {}),
      text: input.text,
      conversation_ref: this.options.conversationRef,
      turn_ref: turnRef,
    }) ?? turnRef;
    return { turnRef, queryMessageId };
  }

  async editAndResend(input: EditAndResendInput): Promise<TurnResult> {
    const normalizedText = input.text.trim();
    if (!normalizedText) {
      throw new Error('editAndResend requires non-empty text');
    }
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    const userIndex = events.findIndex(event => (
      event.type === 'user_message' && eventMatchesId(event, input.messageId)
    ));
    if (userIndex < 0) {
      throw new Error(`Cannot edit missing user message: ${input.messageId}`);
    }
    await this.rewriteToRevision({
      events,
      preservedEvents: events.slice(0, userIndex),
      removedEvents: events.slice(userIndex),
      reason: 'edit_resend',
      replacementText: normalizedText,
    });
    return this.send({
      text: normalizedText,
      turnRef: input.turnRef,
      payload: {
        ...events[userIndex].payload,
        ...(input.payload ?? {}),
      },
    });
  }

  async retryTurn(input: RetryTurnInput = {}): Promise<TurnResult> {
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    const targetIndex = input.messageId
      ? events.findIndex(event => eventMatchesId(event, input.messageId))
      : events.length - 1;
    const searchStart = targetIndex >= 0 ? targetIndex : events.length - 1;
    let userIndex = -1;
    for (let index = searchStart; index >= 0; index -= 1) {
      if (events[index]?.type === 'user_message') {
        userIndex = index;
        break;
      }
    }
    if (userIndex < 0) {
      throw new Error('Cannot retry without a previous user message');
    }
    const retryText = eventText(events[userIndex]);
    if (!retryText.trim()) {
      throw new Error('Cannot retry a user message with empty text');
    }
    await this.rewriteToRevision({
      events,
      preservedEvents: events.slice(0, userIndex),
      removedEvents: events.slice(userIndex),
      reason: 'retry',
      replacementText: retryText,
    });
    return this.send({
      text: retryText,
      turnRef: input.turnRef,
      payload: {
        ...events[userIndex].payload,
        ...(input.payload ?? {}),
      },
    });
  }

  async stop(turnRef: string | null = this.state.activeTurnRef ?? null): Promise<void> {
    await this.options.transport?.stop({
      conversation_ref: this.options.conversationRef,
      turn_ref: turnRef,
    });
    await this.applyEvent(createConversationEvent({
      type: 'turn_stopped',
      conversationRef: this.options.conversationRef,
      revisionId: this.state.revisionId,
      turnRef,
      source: 'ui',
      payload: {},
    }));
  }

  async rehydrate(): Promise<RehydrateSnapshot> {
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    const compactedReplay = await this.options.store.loadCompactedReplay?.(this.options.conversationRef) ?? null;
    const snapshot = isCompleteReplaySnapshot(compactedReplay)
      ? {
          conversationRef: this.options.conversationRef,
          revisionId: compactedReplay.sourceRevisionId,
          messages: compactedReplay.entries,
          replayGenerationId: compactedReplay.generationId,
        }
      : buildRehydrateSnapshot(events);
    await this.options.transport?.sendRehydrate({
      conversation_ref: this.options.conversationRef,
      messages: snapshot.messages,
    });
    return snapshot;
  }

  close(): void {
    this.detachTransport?.();
    this.detachTransport = undefined;
    this.listeners.clear();
  }

  private async rewriteToRevision({
    events,
    preservedEvents,
    removedEvents,
    reason,
    replacementText,
  }: {
    events: ConversationEvent[];
    preservedEvents: ConversationEvent[];
    removedEvents: ConversationEvent[];
    reason: 'edit_resend' | 'retry';
    replacementText: string;
  }): Promise<void> {
    const baseRevisionId = events[events.length - 1]?.revisionId ?? this.state.revisionId;
    const newRevisionId = createRuntimeId('rev');
    const rewriteEvent = createConversationEvent({
      type: 'conversation_rewritten',
      conversationRef: this.options.conversationRef,
      revisionId: newRevisionId,
      source: 'sdk',
      payload: {
        baseRevisionId,
        reason,
        replacementUserMessage: {
          text: replacementText,
        },
        removedEventIds: removedEvents.map(event => event.eventId),
      },
    });
    const nextEvents = [...preservedEvents, rewriteEvent];
    await this.options.store.rewriteConversation({
      conversationRef: this.options.conversationRef,
      baseRevisionId,
      newRevisionId,
      cutAfterEventId: preservedEvents[preservedEvents.length - 1]?.eventId ?? null,
      replacementUserMessage: { text: replacementText },
      preservedEvents: nextEvents,
      removedEventIds: removedEvents.map(event => event.eventId),
      reason,
    });
    this.state = nextEvents.reduce(
      (state, event) => reduceConversationRuntimeState(state, event),
      createInitialConversationRuntimeState(this.options.conversationRef, newRevisionId),
    );
    const snapshot = this.snapshot(await this.options.store.loadEvents(this.options.conversationRef));
    this.listeners.forEach(listener => listener(snapshot));
  }

  private async applyEvent(event: ConversationEvent): Promise<void> {
    await this.options.store.appendEvent(event);
    this.state = reduceConversationRuntimeState(this.state, event);
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    const snapshot = this.snapshot(events);
    this.listeners.forEach(listener => listener(snapshot));
  }

  private snapshot(events: ConversationEvent[]): ConversationSnapshot {
    return {
      state: this.state,
      display: buildDisplayConversation(events),
      rehydrate: buildRehydrateSnapshot(events),
    };
  }
}
