import { InMemoryConversationStore } from '../stores/InMemoryConversationStore.js';
import type {
  ConversationMetadata,
  ConversationStore,
  JsonRecord,
  ListConversationOptions,
} from '../conversation/types.js';
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
import {
  SdkConversationRuntime,
  type SendInput,
} from './ConversationRuntime.js';
import {
  toAgentStreamEvent,
  toolOutputStreamKey,
  type WindieAgentStreamEvent,
} from './AgentStreamEvents.js';

export type WindieAgentQueryOptions = Partial<Omit<WindieAgentQueryInput, 'text' | 'conversationRef'>> & {
  conversationRef?: string;
  model?: WindieModelSelection;
};

export type WindieAgentOwner = {
  listAgents(): Array<{ id: string; agentDefinition: JsonRecord }>;
};

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
          const key = toolOutputStreamKey(runtimeEvent.event);
          if (key && seenToolOutputs.has(key)) {
            continue;
          }
          if (key) {
            seenToolOutputs.add(key);
          }
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

  async listConversations(options: ListConversationOptions & {
    store?: ConversationStore;
  } = {}): Promise<ConversationMetadata[]> {
    const { store, ...listOptions } = options;
    return (store ?? this.defaultConversationStore).listMetadata(listOptions);
  }

  async loadConversation(options: {
    conversationRef: string;
    revisionId?: string;
    store?: ConversationStore;
  }): Promise<ReturnType<SdkConversationRuntime['load']>> {
    return this.conversation(options).load();
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
