import { createConversationEvent, createRuntimeId } from '../conversation/events.js';
import { isBackendEvent } from '../backendEvents.js';
import type {
  BackendTransport,
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
        text: input.text,
        ...(input.payload ?? {}),
      },
    }));
    const queryMessageId = await this.options.transport?.sendQuery({
      text: input.text,
      conversation_ref: this.options.conversationRef,
      turn_ref: turnRef,
      ...(input.payload ?? {}),
    }) ?? turnRef;
    return { turnRef, queryMessageId };
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
    const snapshot = buildRehydrateSnapshot(events);
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
