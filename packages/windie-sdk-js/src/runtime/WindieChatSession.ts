import type {
  ConversationEvent,
  DisplayConversation,
  RehydrateSnapshot,
} from '../conversation/types.js';
import {
  toAgentStreamEvent,
  toolOutputStreamKeys,
  type WindieAgentStreamEvent,
} from './AgentStreamEvents.js';
import type {
  ConversationEventListener,
  ConversationListener,
  ConversationSnapshot,
  EditAndResendInput,
  RetryTurnInput,
  SdkConversationRuntime,
  SendInput,
  TurnResult,
} from './ConversationRuntime.js';

export type WindieChatSendInput = string | SendInput;
export type WindieChatEditInput = EditAndResendInput;
export type WindieChatRetryInput = RetryTurnInput;

function normalizeSendInput(input: WindieChatSendInput): SendInput {
  return typeof input === 'string' ? { text: input } : input;
}

export class WindieChatSession {
  constructor(readonly conversationRef: string, private readonly runtime: SdkConversationRuntime) {}

  subscribe(listener: ConversationListener): () => void {
    return this.runtime.subscribe(listener);
  }

  onEvent(listener: ConversationEventListener): () => void {
    return this.runtime.subscribeEvents(listener);
  }

  async load(): Promise<ConversationSnapshot> {
    return this.runtime.load();
  }

  async display(): Promise<DisplayConversation> {
    return (await this.load()).display;
  }

  async send(input: WindieChatSendInput): Promise<TurnResult> {
    return this.runtime.send(normalizeSendInput(input));
  }

  async *stream(input: WindieChatSendInput): AsyncIterableIterator<WindieAgentStreamEvent> {
    const seenToolOutputs = new Set<string>();
    for await (const runtimeEvent of this.runtime.stream(normalizeSendInput(input))) {
      const streamEvent = toAgentStreamEvent(runtimeEvent);
      if (!streamEvent) {
        continue;
      }
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

  async editAndResend(input: WindieChatEditInput): Promise<TurnResult> {
    return this.runtime.editAndResend(input);
  }

  async retry(input: WindieChatRetryInput = {}): Promise<TurnResult> {
    return this.runtime.retryTurn(input);
  }

  async stop(turnRef?: string | null): Promise<void> {
    await this.runtime.stop(turnRef ?? null);
  }

  async rehydrate(): Promise<RehydrateSnapshot> {
    return this.runtime.rehydrate();
  }

  close(): void {
    this.runtime.close();
  }

  onConversationEvent(listener: (event: ConversationEvent, snapshot: ConversationSnapshot) => void): () => void {
    return this.onEvent(listener);
  }
}
