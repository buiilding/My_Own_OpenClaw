import { InMemoryConversationStore } from '../stores/InMemoryConversationStore.js';
import type { BackendEvent } from '../events/backendEvents.js';
import type {
  ConversationMetadata,
  ConversationStore,
  JsonRecord,
  ListConversationOptions,
  SearchConversationOptions,
} from '../conversation/types.js';
import { searchConversationMetadata } from '../conversation/metadata.js';
import {
  createWindieAgentBackendTransport,
  type WindieAgentQueryInput,
  type WindieAgentSession,
} from '../transport/WindieAgentSession.js';
import {
  WindieSdkClient,
  type SdkModelsResponse,
} from '../transport/HostedBackendHttpClient.js';
import {
  buildModelSettingsPatch,
  type WindieModelSelection,
} from '../settings/modelSelection.js';
import type { WindieLocalRuntimeClient } from './LocalSidecarRuntime.js';
import type {
  WindieLocalRuntimeEventListener,
} from './LocalSidecarRuntime.js';
import {
  SdkConversationRuntime,
  type SendInput,
} from './ConversationRuntime.js';
import {
  toAgentStreamEvent,
  toolOutputStreamKeys,
  type WindieAgentStreamEvent,
} from './AgentStreamEvents.js';

export type WindieAgentQueryOptions = Partial<Omit<WindieAgentQueryInput, 'text' | 'conversationRef'>> & {
  conversationRef?: string;
  model?: WindieModelSelection;
};

export type WindieAgentOwner = {
  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }>;
};

export type LoadConversationOptions = {
  conversationRef: string;
  revisionId?: string;
  store?: ConversationStore;
};

export type RawBackendEventListener = (event: BackendEvent) => void;

export class WindieAgent {
  private readonly defaultConversationStore = new InMemoryConversationStore();

  constructor(
    readonly id: string,
    readonly session: WindieAgentSession,
    readonly agentDefinition: JsonRecord,
    private readonly sdkClient: WindieSdkClient,
    private readonly owner: WindieAgentOwner,
    private readonly localRuntime?: WindieLocalRuntimeClient,
  ) {}

  async ask(text: string, options: WindieAgentQueryOptions = {}): Promise<string> {
    if (options.model) {
      await this.setModel(options.model);
    }
    return this.session.query(this.buildQueryInput(text, options));
  }

  async query(payload: WindieAgentQueryInput): Promise<string> {
    return this.session.query(payload);
  }

  async run(input: string | WindieAgentQueryInput, options: WindieAgentQueryOptions = {}): Promise<string> {
    if (typeof input === 'string') {
      return this.ask(input, options);
    }
    if (options.model) {
      await this.setModel(options.model);
    }
    return this.query(input);
  }

  async *stream(
    input: string | WindieAgentQueryInput,
    options: WindieAgentQueryOptions = {},
  ): AsyncIterableIterator<WindieAgentStreamEvent> {
    const queryInput = typeof input === 'string' ? this.buildQueryInput(input, options) : input;
    const model = typeof input === 'string' ? options.model : undefined;
    const seenToolOutputs = new Set<string>();
    const conversation = this.conversation({
      conversationRef: queryInput.conversationRef,
      store: this.defaultConversationStore,
    });
    const payload: SendInput['payload'] = {
      content: queryInput.content ?? undefined,
      screenshot: queryInput.screenshot ?? undefined,
      screenshot_ref: queryInput.screenshotRef ?? undefined,
      screenshot_refs: queryInput.screenshotRefs ?? undefined,
      attachment_context: queryInput.attachmentContext ?? undefined,
      attachment_filenames: queryInput.attachmentFilenames ?? undefined,
      system_state_internal: queryInput.systemStateInternal ?? undefined,
      workspace_path: queryInput.workspacePath ?? undefined,
    };
    for await (const runtimeEvent of conversation.stream({
      text: queryInput.text,
      turnRef: queryInput.turnRef ?? undefined,
      payload,
      model,
    })) {
      const streamEvent = toAgentStreamEvent(runtimeEvent);
      if (streamEvent) {
        if (runtimeEvent.type === 'conversation_event') {
          const keys = toolOutputStreamKeys(runtimeEvent.event);
          if (keys.some(key => seenToolOutputs.has(key))) {
            continue;
          }
          keys.forEach(key => seenToolOutputs.add(key));
        }
        yield streamEvent;
      }
    }
  }

  async stop(conversationRef?: string | null): Promise<string> {
    return this.session.stopQuery(conversationRef);
  }

  conversation(options: {
    conversationRef?: string;
    revisionId?: string;
    store?: ConversationStore;
    localRuntime?: WindieLocalRuntimeClient | null;
  } = {}): SdkConversationRuntime {
    const conversationRef = options.conversationRef ?? `conv-${this.id}`;
    const runtime = new SdkConversationRuntime({
      conversationRef,
      revisionId: options.revisionId,
      store: options.store ?? this.defaultConversationStore,
      transport: createWindieAgentBackendTransport(this.session, conversationRef),
      localRuntime: options.localRuntime === undefined ? this.localRuntime : options.localRuntime,
    });
    runtime.attachTransport();
    return runtime;
  }

  sleep(): void {
    this.session.close(1000, 'sleep');
  }

  async updateSettings(config: JsonRecord): Promise<string> {
    return this.session.updateSettings(config);
  }

  async setModel(selection: WindieModelSelection): Promise<string> {
    return this.updateSettings(buildModelSettingsPatch(selection));
  }

  async listModels(): Promise<SdkModelsResponse> {
    return this.sdkClient.models();
  }

  async listTools(): Promise<{ version?: number; tools?: JsonRecord[] } | null> {
    return this.localRuntime?.listTools ? this.localRuntime.listTools() : null;
  }

  async status(): Promise<JsonRecord | null> {
    return this.localRuntime?.status ? this.localRuntime.status() : null;
  }

  async shutdownLocalRuntime(): Promise<void> {
    await this.localRuntime?.shutdown?.();
  }

  subscribeRawBackendEvents(listener: RawBackendEventListener): () => void {
    return this.session.on('event', listener);
  }

  subscribeLocalRuntimeEvents(listener: WindieLocalRuntimeEventListener): () => void {
    return this.localRuntime?.subscribeEvents?.(listener) ?? (() => {});
  }

  async listConversations(options: ListConversationOptions & {
    store?: ConversationStore;
  } = {}): Promise<ConversationMetadata[]> {
    const { store, ...listOptions } = options;
    return (store ?? this.defaultConversationStore).listMetadata(listOptions);
  }

  async searchConversations(options: SearchConversationOptions & {
    store?: ConversationStore;
  }): Promise<ConversationMetadata[]> {
    const { store, ...searchOptions } = options;
    const conversationStore = store ?? this.defaultConversationStore;
    if (typeof conversationStore.searchMetadata === 'function') {
      return conversationStore.searchMetadata(searchOptions);
    }
    return searchConversationMetadata(await conversationStore.listMetadata(), searchOptions);
  }

  async deleteConversation(options: string | {
    conversationRef: string;
    store?: ConversationStore;
  }): Promise<void> {
    const deleteOptions = typeof options === 'string'
      ? { conversationRef: options }
      : options;
    const conversationStore = deleteOptions.store ?? this.defaultConversationStore;
    if (typeof conversationStore.deleteConversation !== 'function') {
      throw new Error('deleteConversation requires a deletable conversation store');
    }
    await conversationStore.deleteConversation(deleteOptions.conversationRef);
  }

  async loadConversation(
    options: string | LoadConversationOptions,
  ): Promise<ReturnType<SdkConversationRuntime['load']>> {
    const loadOptions = typeof options === 'string'
      ? { conversationRef: options }
      : options;
    return this.conversation(loadOptions).load();
  }

  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }> {
    return this.owner.listAgents();
  }

  private buildQueryInput(text: string, options: WindieAgentQueryOptions): WindieAgentQueryInput {
    const { model: _model, ...queryOptions } = options;
    return {
      ...queryOptions,
      text,
      conversationRef: queryOptions.conversationRef ?? `conv-${this.id}`,
    };
  }
}
