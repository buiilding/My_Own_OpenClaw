import { createConversationEvent, createRuntimeId } from '../conversation/events.js';
import { isBackendEvent } from '../events/backendEvents.js';
import type {
  BackendTransport,
  CompactHistoryPayload,
  ConversationEvent,
  ConversationRuntimeState,
  ConversationStore,
  CurrentTurnProjection,
  DisplayConversation,
  JsonRecord,
  LiveTurnPresentation,
  LocalToolExecutionLifecycle,
  LocalRuntime,
  MemoryStoreChangedPayload,
  RehydratePayload,
  RehydrateSnapshot,
  SdkDisplayRow,
  SettingsPayload,
  TurnInputResource,
  TurnResourceResolverRegistry,
  WakewordPayload,
} from '../conversation/types.js';
import {
  buildCurrentTurnProjection,
  buildDisplayConversation,
  buildDisplayRows,
  buildRehydrateSnapshot,
} from '../projections/conversationProjections.js';
import { normalizeBackendEventToConversationEvent } from '../transport/backendEventNormalizer.js';
import type { WindieSdkClient } from '../transport/HostedBackendHttpClient.js';
import { ToolExecutionCoordinator } from '../tools/ToolExecutionCoordinator.js';
import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from '../settings/modelSelection.js';
import {
  storeCompletedTurnMemory,
  type MemoryRetrievalDiagnostic,
} from './ContextEnrichmentPipeline.js';
import { reduceConversationRuntimeState, createInitialConversationRuntimeState } from './conversationReducer.js';
import { getConversationEventScope, isConversationControlEvent } from './conversationEventScope.js';
import { resolveTurnInputResources } from './TurnInputPipeline.js';

export type ConversationListener = (snapshot: ConversationSnapshot) => void;
export type ConversationEventListener = (event: ConversationEvent, snapshot: ConversationSnapshot) => void;

export type ConversationSnapshot = {
  state: ConversationRuntimeState;
  display: DisplayConversation;
  displayRows: SdkDisplayRow[];
  rehydrate: RehydrateSnapshot;
  currentTurn: CurrentTurnProjection;
  liveTurnPresentation: LiveTurnPresentation;
};

export type SendInput = {
  text: string;
  turnRef?: string;
  payload?: JsonRecord;
  resources?: TurnInputResource[] | null;
  metadata?: JsonRecord | null;
  model?: WindieModelSelection;
};

export type TurnResult = {
  turnRef: string;
  queryMessageId: string;
};

export type EditAndResendInput = {
  messageId: string;
  userMessageOrdinal?: number;
  text: string;
  turnRef?: string;
  payload?: JsonRecord;
  model?: WindieModelSelection;
};

export type RetryTurnInput = {
  messageId?: string;
  userMessageOrdinal?: number;
  turnRef?: string;
  payload?: JsonRecord;
  model?: WindieModelSelection;
};

export type PreparedReplayTurn = {
  text: string;
  turnRef?: string;
  payload: JsonRecord;
  model?: WindieModelSelection;
};

export type CompactHistoryInput = {
  force?: boolean;
  payload?: JsonRecord;
};

export type WindieRuntimeEvent =
  | {
      type: 'turn_started';
      result: TurnResult;
      snapshot: ConversationSnapshot;
    }
  | {
      type: 'conversation_event';
      event: ConversationEvent;
      snapshot: ConversationSnapshot;
    }
  | {
      type: 'error';
      error: unknown;
      snapshot?: ConversationSnapshot;
    };

export type ConversationRuntimeOptions = {
  conversationRef: string;
  revisionId?: string;
  store: ConversationStore;
  transport?: BackendTransport;
  localRuntime?: Partial<Pick<LocalRuntime, 'executeTool' | 'rpc'>> | null;
  localToolLifecycle?: LocalToolExecutionLifecycle | null;
  sdkClient?: WindieSdkClient;
  userId?: string;
  memoryEnabled?: boolean;
  resourceResolvers?: TurnResourceResolverRegistry | null;
  enrichQuery?: (input: {
    text: string;
    conversationRef: string;
    payload?: JsonRecord | null;
    emitDiagnostic?: (diagnostic: MemoryRetrievalDiagnostic) => void | Promise<void>;
  }) => Promise<JsonRecord>;
};

type PendingTurn = {
  turnRef: string;
  conversationRef: string;
  revisionId: string;
  userText: string;
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

function findUserEventIndexByOrdinal(
  events: ConversationEvent[],
  userMessageOrdinal: number | undefined,
): number {
  if (!Number.isInteger(userMessageOrdinal) || (userMessageOrdinal ?? -1) < 0) {
    return -1;
  }
  let currentOrdinal = -1;
  for (let index = 0; index < events.length; index += 1) {
    if (events[index]?.type !== 'user_message') {
      continue;
    }
    currentOrdinal += 1;
    if (currentOrdinal === userMessageOrdinal) {
      return index;
    }
  }
  return -1;
}

function isTerminalConversationEvent(event: ConversationEvent): boolean {
  return event.type === 'turn_completed'
    || event.type === 'turn_stopped'
    || event.type === 'turn_error'
    || event.type === 'runtime_error'
    || event.type === 'compaction_failed';
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOwnEnumerableKeys(value: JsonRecord): boolean {
  return Object.keys(value).length > 0;
}

export class SdkConversationRuntime {
  private state: ConversationRuntimeState;
  private events: ConversationEvent[] = [];
  private readonly listeners = new Set<ConversationListener>();
  private readonly eventListeners = new Set<ConversationEventListener>();
  private readonly localEventCounters = new Map<string, number>();
  private readonly backendTurnSequences = new Map<string, { lastSequence: number; eventIds: Set<string> }>();
  private readonly pendingTurns = new Map<string, PendingTurn>();
  private backendEventQueue: Promise<void> = Promise.resolve();
  private detachTransport?: () => void;

  constructor(
    private readonly options: ConversationRuntimeOptions,
  ) {
    this.state = createInitialConversationRuntimeState(
      options.conversationRef,
      options.revisionId,
    );
  }

  async load(): Promise<ConversationSnapshot> {
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    this.events = events;
    this.state = events.reduce(
      (state, event) => reduceConversationRuntimeState(state, event),
      createInitialConversationRuntimeState(
        this.options.conversationRef,
        events[events.length - 1]?.revisionId ?? this.state.revisionId,
      ),
    );
    return this.snapshot(this.events);
  }

  subscribe(listener: ConversationListener): () => void {
    this.listeners.add(listener);
    void this.load().then(snapshot => listener(snapshot));
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeEvents(listener: ConversationEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
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
        fallbackRevisionId: this.state.revisionId,
      });
      if (event) {
        this.enqueueBackendEvent(event);
      }
    });
  }

  async send(input: SendInput): Promise<TurnResult> {
    if (input.model) {
      await this.setModel(input.model);
    }
    const turnRef = input.turnRef ?? createRuntimeId('turn');
    const revisionId = this.state.revisionId === 'rev-empty'
      ? createRuntimeId('rev')
      : this.state.revisionId;
    const memoryDiagnostics: MemoryRetrievalDiagnostic[] = [];
    const emitMemoryDiagnostic = (diagnostic: MemoryRetrievalDiagnostic): void => {
      memoryDiagnostics.push(diagnostic);
    };
    const pendingTurn: PendingTurn = {
      turnRef,
      conversationRef: this.options.conversationRef,
      revisionId,
      userText: input.text,
    };
    this.pendingTurns.set(turnRef, pendingTurn);
    let queryMessageId: string;
    try {
      await this.applyEvent(createConversationEvent({
        eventId: this.nextLocalEventId(turnRef, 'turn_started'),
        type: 'turn_started',
        conversationRef: this.options.conversationRef,
        revisionId,
        turnRef,
        source: 'sdk',
        payload: {},
      }));
      const baseUserPayload = isJsonRecord(input.metadata)
        ? input.metadata
        : (isJsonRecord(input.payload) ? input.payload : {});
      await this.applyEvent(createConversationEvent({
        eventId: this.nextLocalEventId(turnRef, 'user_message'),
        type: 'user_message',
        conversationRef: this.options.conversationRef,
        revisionId,
        turnRef,
        source: 'ui',
        payload: {
          ...baseUserPayload,
          text: input.text,
        },
      }));
      const sourcePayload = isJsonRecord(input.payload) ? input.payload : {};
      const resourceResolution = await resolveTurnInputResources({
        resources: input.resources ?? null,
        resolvers: this.options.resourceResolvers ?? null,
        context: {
          text: input.text,
          conversationRef: this.options.conversationRef,
          turnRef,
          payload: sourcePayload,
        },
      });
      const payloadForEnrichment = {
        ...sourcePayload,
        ...resourceResolution.payload,
      };
      const enrichedPayload = this.options.enrichQuery
        ? await this.options.enrichQuery({
          text: input.text,
          conversationRef: this.options.conversationRef,
          payload: payloadForEnrichment,
          emitDiagnostic: emitMemoryDiagnostic,
        })
        : payloadForEnrichment;
      for (const diagnostic of memoryDiagnostics) {
        await this.applyEvent(createConversationEvent({
          eventId: this.nextLocalEventId(turnRef, 'memory_retrieval_diagnostic'),
          type: 'memory_retrieval_diagnostic',
          conversationRef: this.options.conversationRef,
          revisionId,
          turnRef,
          source: 'sdk',
          payload: {
            ...diagnostic,
          },
        }));
      }
      const metadataPayload = {
        ...resourceResolution.metadata,
        ...enrichedPayload,
      };
      if (this.options.enrichQuery || hasOwnEnumerableKeys(resourceResolution.metadata)) {
        await this.applyEvent(createConversationEvent({
          eventId: this.nextLocalEventId(turnRef, 'user_message_metadata'),
          type: 'user_message_metadata',
          conversationRef: this.options.conversationRef,
          revisionId,
          turnRef,
          source: 'sdk',
          payload: {
            ...metadataPayload,
            text: input.text,
          },
        }));
      }
      if (!this.options.transport) {
        queryMessageId = turnRef;
      } else {
        const sentQueryMessageId = await this.options.transport.sendQuery({
          ...enrichedPayload,
          text: input.text,
          conversation_ref: this.options.conversationRef,
        }, {
          messageId: turnRef,
        });
        if (!sentQueryMessageId) {
          throw new Error('Failed to send query to backend');
        }
        queryMessageId = sentQueryMessageId;
      }
    } catch (error) {
      this.pendingTurns.delete(turnRef);
      await this.applyEvent(createConversationEvent({
        eventId: this.nextLocalEventId(turnRef, 'turn_error'),
        type: 'turn_error',
        conversationRef: this.options.conversationRef,
        revisionId,
        turnRef,
        source: 'sdk',
        payload: {
          error: error instanceof Error ? error.message : String(error),
          reason: 'send_failed',
        },
      }));
      throw error;
    }
    return { turnRef, queryMessageId };
  }

  async *stream(input: SendInput): AsyncIterable<WindieRuntimeEvent> {
    const queue: WindieRuntimeEvent[] = [];
    let finished = false;
    let notify: (() => void) | null = null;
    let sendError: unknown = null;
    const wake = () => {
      notify?.();
      notify = null;
    };
    const push = (event: WindieRuntimeEvent) => {
      if (finished) {
        return;
      }
      queue.push(event);
      if (event.type === 'conversation_event' && isTerminalConversationEvent(event.event)) {
        finished = true;
      }
      wake();
    };
    const next = async (): Promise<WindieRuntimeEvent | null> => {
      while (queue.length === 0 && !finished) {
        await new Promise<void>(resolve => {
          notify = resolve;
        });
      }
      return queue.shift() ?? null;
    };
    const unsubscribe = this.subscribeEvents((event, snapshot) => {
      push({ type: 'conversation_event', event, snapshot });
    });
    const sendPromise = this.send(input)
      .then(async result => {
        push({
          type: 'turn_started',
          result,
          snapshot: await this.load(),
        });
      })
      .catch(async error => {
        sendError = error;
        let snapshot: ConversationSnapshot | undefined;
        try {
          snapshot = await this.load();
        } catch {
          snapshot = undefined;
        }
        push({ type: 'error', error, snapshot });
        finished = true;
        wake();
      });
    try {
      while (true) {
        const event = await next();
        if (!event) {
          break;
        }
        yield event;
      }
      await sendPromise;
      if (sendError) {
        throw sendError;
      }
    } finally {
      finished = true;
      unsubscribe();
      wake();
    }
  }

  async editAndResend(input: EditAndResendInput): Promise<TurnResult> {
    const prepared = await this.prepareEditAndResend(input);
    return this.send(prepared);
  }

  async prepareEditAndResend(input: EditAndResendInput): Promise<PreparedReplayTurn> {
    const normalizedText = input.text.trim();
    if (!normalizedText) {
      throw new Error('editAndResend requires non-empty text');
    }
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    let userIndex = events.findIndex(event => (
      event.type === 'user_message' && eventMatchesId(event, input.messageId)
    ));
    if (userIndex < 0) {
      userIndex = findUserEventIndexByOrdinal(events, input.userMessageOrdinal);
    }
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
    await this.rehydrate();
    return {
      text: normalizedText,
      turnRef: input.turnRef,
      model: input.model,
      payload: {
        ...events[userIndex].payload,
        ...(input.payload ?? {}),
      },
    };
  }

  async retryTurn(input: RetryTurnInput = {}): Promise<TurnResult> {
    const prepared = await this.prepareRetryTurn(input);
    return this.send(prepared);
  }

  async prepareRetryTurn(input: RetryTurnInput = {}): Promise<PreparedReplayTurn> {
    const events = await this.options.store.loadEvents(this.options.conversationRef);
    const targetIndex = input.messageId
      ? events.findIndex(event => eventMatchesId(event, input.messageId))
      : events.length - 1;
    const ordinalUserIndex = findUserEventIndexByOrdinal(events, input.userMessageOrdinal);
    const searchStart = targetIndex >= 0
      ? targetIndex
      : (ordinalUserIndex >= 0 ? ordinalUserIndex : events.length - 1);
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
    await this.rehydrate();
    return {
      text: retryText,
      turnRef: input.turnRef,
      model: input.model,
      payload: {
        ...events[userIndex].payload,
        ...(input.payload ?? {}),
      },
    };
  }

  async stop(turnRef: string | null = this.state.activeTurnRef ?? null): Promise<void> {
    await this.options.transport?.stop({
      conversation_ref: this.options.conversationRef,
      turn_ref: turnRef,
    });
    await this.applyEvent(createConversationEvent({
      eventId: this.nextLocalEventId(turnRef, 'turn_stopped'),
      type: 'turn_stopped',
      conversationRef: this.options.conversationRef,
      revisionId: this.state.revisionId,
      turnRef,
      source: 'ui',
      payload: {},
    }));
  }

  async rehydrate(): Promise<RehydrateSnapshot> {
    const snapshot = await this.options.store.loadForRehydrate(this.options.conversationRef);
    await this.options.transport?.rehydrateConversation({
      conversation_ref: this.options.conversationRef,
      messages: snapshot.messages,
      rehydrate_mode: 'replace',
    });
    return snapshot;
  }

  async rehydrateMessages(payload: RehydratePayload): Promise<void> {
    await this.options.transport?.rehydrateConversation({
      ...payload,
      rehydrate_mode: 'replace',
    });
  }

  async compactHistory(input: CompactHistoryInput = {}): Promise<string | void> {
    const payload: CompactHistoryPayload = {
      ...(input.payload ?? {}),
      force: input.force ?? true,
      conversation_ref: this.options.conversationRef,
    };
    return this.options.transport?.compactHistory(payload);
  }

  async wakewordDetected(payload: WakewordPayload = {}): Promise<string | void> {
    return this.options.transport?.wakewordDetected(payload);
  }

  async updateSettings(payload: SettingsPayload): Promise<string | void> {
    return this.options.transport?.updateSettings(payload);
  }

  async requestModelList(): Promise<string | void> {
    return this.options.transport?.listModels();
  }

  async ensureConnected(): Promise<void> {
    await this.options.transport?.connect();
  }

  async setModel(selection: WindieModelSelection): Promise<string | void> {
    if (!this.options.transport) {
      throw new Error('ConversationRuntime.setModel requires a backend transport');
    }
    const settings = buildModelSettingsPatch(selection, 'ConversationRuntime.setModel');
    const backendMessageId = await this.options.transport.updateSettings(settings);
    const revisionId = this.state.revisionId === 'rev-empty'
      ? createRuntimeId('rev')
      : this.state.revisionId;
    await this.applyEvent(createConversationEvent({
      eventId: this.nextLocalEventId(null, 'settings_updated'),
      type: 'settings_updated',
      conversationRef: this.options.conversationRef,
      revisionId,
      source: 'sdk',
      payload: {
        ...settings,
        backendMessageId: backendMessageId ?? null,
      },
    }));
    return backendMessageId;
  }

  close(): void {
    this.detachTransport?.();
    this.detachTransport = undefined;
    this.listeners.clear();
    this.eventListeners.clear();
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
      eventId: this.nextLocalEventId(null, 'conversation_rewritten'),
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
    this.events = nextEvents;
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
    this.events = await this.options.store.loadEvents(this.options.conversationRef);
    const snapshot = this.snapshot(this.events);
    this.notify(snapshot, rewriteEvent);
  }

  private async applyEvent(event: ConversationEvent): Promise<void> {
    this.events = [...this.events, event];
    this.state = reduceConversationRuntimeState(this.state, event);
    if ((event.type === 'turn_stopped' || event.type === 'turn_error') && event.turnRef) {
      this.pendingTurns.delete(event.turnRef);
    }
    const snapshot = this.snapshot(this.events);
    this.notify(snapshot, event);
    await this.options.store.appendEvent(event);
    await this.maybeExecuteTool(event);
  }

  private async applyBackendTurnCompleted(event: ConversationEvent): Promise<void> {
    this.events = [...this.events, event];
    this.state = reduceConversationRuntimeState(this.state, event);
    await this.options.store.appendEvent(event);
    await this.persistCompletedTurnMemory(event);
    const snapshot = this.snapshot(this.events);
    this.notify(snapshot, event);
  }

  private async persistCompletedTurnMemory(event: ConversationEvent): Promise<void> {
    const assistantResponse = typeof event.payload.finalResponse === 'string'
      ? event.payload.finalResponse
      : '';
    const pendingTurn = event.turnRef ? this.pendingTurns.get(event.turnRef) : undefined;
    if (!pendingTurn) {
      return;
    }
    this.pendingTurns.delete(pendingTurn.turnRef);
    if (!this.options.sdkClient) {
      return;
    }
    try {
      const result = await storeCompletedTurnMemory({
        localRuntime: this.options.localRuntime,
        sdkClient: this.options.sdkClient,
        userId: this.options.userId ?? 'local-sdk-user',
        conversationRef: event.conversationRef,
        userQuery: pendingTurn.userText,
        assistantResponse,
        memoryEnabled: this.options.memoryEnabled,
      });
      if (!result) {
        return;
      }
      await this.applyEvent(createConversationEvent<MemoryStoreChangedPayload>({
        eventId: this.nextLocalEventId(event.turnRef, 'memory_store_changed'),
        type: 'memory_store_changed',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sdk',
        payload: {
          userId: this.options.userId ?? 'local-sdk-user',
          conversationRef: event.conversationRef,
          memoryTypes: ['episodic'],
          reason: 'completed_turn',
          memoryId: result.memoryId ?? null,
        },
      }));
    } catch (error) {
      console.warn(
        '[Windie SDK] Memory persistence failed:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private nextLocalEventId(turnRef: string | null | undefined, type: string): string {
    const scope = turnRef && turnRef.trim() ? turnRef.trim() : this.options.conversationRef;
    const next = (this.localEventCounters.get(scope) ?? 0) + 1;
    this.localEventCounters.set(scope, next);
    return `${scope}-sdk-evt-${next.toString().padStart(6, '0')}-${type}`;
  }

  private backendSequenceKey(event: ConversationEvent): string {
    return event.turnRef ?? `conversation:${event.conversationRef}`;
  }

  private enqueueBackendEvent(event: ConversationEvent): void {
    this.backendEventQueue = this.backendEventQueue
      .then(() => this.processNormalizedBackendEvent(event))
      .catch(error => {
        console.warn(
          '[Windie SDK] Backend event processing failed:',
          error instanceof Error ? error.message : String(error),
        );
      });
  }

  private async processNormalizedBackendEvent(event: ConversationEvent): Promise<void> {
    if (event.source !== 'backend') {
      await this.applyEvent(event);
      return;
    }
    if (!this.shouldAcceptBackendEvent(event)) {
      return;
    }
    const sequence = typeof event.payload.backendSequence === 'number'
      ? event.payload.backendSequence
      : null;
    if (!Number.isInteger(sequence) || (sequence ?? 0) <= 0) {
      await this.applyBackendSequenceError(event, {
        reason: 'missing_backend_sequence',
        error: 'Backend stream event missing producer sequence',
      });
      return;
    }

    const key = this.backendSequenceKey(event);
    const state = this.backendTurnSequences.get(key) ?? {
      lastSequence: 0,
      eventIds: new Set<string>(),
    };
    if (state.eventIds.has(event.eventId)) {
      return;
    }
    if (sequence <= state.lastSequence) {
      await this.applyBackendSequenceError(event, {
        reason: 'backend_sequence_regressed',
        error: `Backend stream sequence regressed from ${state.lastSequence} to ${sequence}`,
        lastSequence: state.lastSequence,
        receivedSequence: sequence,
      });
      return;
    }
    if (sequence > state.lastSequence + 1) {
      await this.applyBackendSequenceError(event, {
        reason: 'backend_sequence_gap',
        error: `Backend stream sequence gap before ${sequence}`,
        missing_sequence_start: state.lastSequence + 1,
        missing_sequence_end: sequence - 1,
        lastSequence: state.lastSequence,
        receivedSequence: sequence,
      });
    }
    state.eventIds.add(event.eventId);
    state.lastSequence = sequence;
    this.backendTurnSequences.set(key, state);
    if (event.type === 'turn_completed') {
      await this.applyBackendTurnCompleted(event);
      return;
    }
    await this.applyEvent(event);
  }

  private async applyBackendSequenceError(
    event: ConversationEvent,
    payload: JsonRecord,
  ): Promise<void> {
    await this.applyEvent(createConversationEvent({
      eventId: this.nextLocalEventId(event.turnRef, 'runtime_error'),
      type: 'runtime_error',
      conversationRef: event.conversationRef,
      revisionId: event.revisionId,
      turnRef: event.turnRef,
      source: 'sdk',
      payload: {
        ...payload,
        sourceEventId: event.eventId,
        sourceEventType: event.type,
      },
    }));
  }

  private shouldAcceptBackendEvent(event: ConversationEvent): boolean {
    if (event.source !== 'backend') {
      return true;
    }
    if (event.conversationRef !== this.options.conversationRef) {
      this.logRejectedBackendEvent(event, 'conversation_ref_mismatch');
      return false;
    }
    if (
      !isConversationControlEvent(event)
      && event.turnRef
      && this.state.activeTurnRef
      && event.turnRef !== this.state.activeTurnRef
    ) {
      this.logRejectedBackendEvent(event, 'active_turn_ref_mismatch');
      return false;
    }
    return true;
  }

  private logRejectedBackendEvent(event: ConversationEvent, reason: string): void {
    if (!isConversationControlEvent(event)) {
      return;
    }
    console.log('[Windie SDK][Compaction] backend event rejected', {
      reason,
      eventType: event.type,
      eventScope: getConversationEventScope(event),
      conversationRef: event.conversationRef,
      expectedConversationRef: this.options.conversationRef,
      turnRef: event.turnRef ?? null,
      activeTurnRef: this.state.activeTurnRef ?? null,
      phase: this.state.phase,
      eventId: event.eventId,
      backendSequence: typeof event.payload.backendSequence === 'number'
        ? event.payload.backendSequence
        : null,
    });
  }

  private notify(snapshot: ConversationSnapshot, event?: ConversationEvent): void {
    this.listeners.forEach(listener => listener(snapshot));
    if (event) {
      this.eventListeners.forEach(listener => listener(event, snapshot));
    }
  }

  private async maybeExecuteTool(event: ConversationEvent): Promise<void> {
    if (
      event.source !== 'backend'
      || (event.type !== 'tool_call' && event.type !== 'tool_bundle_call')
      || !this.options.localRuntime?.executeTool
      || !this.options.transport
    ) {
      return;
    }
    const coordinator = new ToolExecutionCoordinator({
      localRuntime: this.options.localRuntime,
      localToolLifecycle: this.options.localToolLifecycle,
      store: {
        appendEvent: async outputEvent => {
          await this.applyEvent(outputEvent);
        },
      },
      artifactUploader: this.options.sdkClient?.artifacts,
      sendToolResult: async payload => this.options.transport!.sendToolResult(payload),
      sendToolBundleResult: async payload => this.options.transport!.sendToolBundleResult(payload),
    });
    try {
      const claim = await coordinator.execute(event);
      if (!claim.claimed) {
        await this.applyEvent(createConversationEvent({
          eventId: this.nextLocalEventId(event.turnRef, 'runtime_error'),
          type: 'runtime_error',
          conversationRef: event.conversationRef,
          revisionId: event.revisionId,
          turnRef: event.turnRef,
          source: 'sdk',
          payload: {
            error: `Malformed tool event: ${claim.reason ?? 'unclaimable-tool-event'}`,
            reason: 'malformed_tool_event',
            claimReason: claim.reason ?? null,
          },
        }));
      }
    } catch (error) {
      await this.applyEvent(createConversationEvent({
        eventId: this.nextLocalEventId(event.turnRef, 'turn_error'),
        type: 'turn_error',
        conversationRef: event.conversationRef,
        revisionId: event.revisionId,
        turnRef: event.turnRef,
        source: 'sdk',
        payload: {
          error: error instanceof Error ? error.message : String(error),
          reason: 'tool_result_delivery_failed',
        },
      }));
    }
  }

  private snapshot(events: ConversationEvent[]): ConversationSnapshot {
    const currentTurn = buildCurrentTurnProjection(events);
    return {
      state: this.state,
      display: buildDisplayConversation(events),
      displayRows: buildDisplayRows(events),
      rehydrate: buildRehydrateSnapshot(events),
      currentTurn,
      liveTurnPresentation: currentTurn.presentation,
    };
  }
}

export function createConversationRuntime(options: ConversationRuntimeOptions): SdkConversationRuntime {
  return new SdkConversationRuntime(options);
}
