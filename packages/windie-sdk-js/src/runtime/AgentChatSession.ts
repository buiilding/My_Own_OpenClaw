/**
 * Provides the reusable chat session module for the TypeScript SDK runtime.
 */

import type {
  ConversationEvent,
  DisplayConversation,
  RehydrateSnapshot,
} from '../conversation/types.js';
import {
  toAgentStreamEvents,
  toolOutputStreamKeys,
  type AgentStreamEvent,
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

export type AgentChatSendInput = string | SendInput;
export type AgentChatEditInput = EditAndResendInput;
export type AgentChatRetryInput = RetryTurnInput;

function normalizeSendInput(input: AgentChatSendInput): SendInput {
  return typeof input === 'string' ? { text: input } : input;
}

export class AgentChatSession {
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

  async send(input: AgentChatSendInput): Promise<TurnResult> {
    return this.runtime.send(normalizeSendInput(input));
  }

  async *stream(input: AgentChatSendInput): AsyncIterableIterator<AgentStreamEvent> {
    const seenToolOutputs = new Set<string>();
    for await (const runtimeEvent of this.runtime.stream(normalizeSendInput(input))) {
      const streamEvents = toAgentStreamEvents(runtimeEvent);
      if (streamEvents.length === 0) {
        continue;
      }
      if (runtimeEvent.type === 'conversation_event') {
        const keys = toolOutputStreamKeys(runtimeEvent.event);
        if (keys.some(key => seenToolOutputs.has(key))) {
          continue;
        }
        keys.forEach(key => seenToolOutputs.add(key));
      }
      for (const streamEvent of streamEvents) {
        yield streamEvent;
      }
    }
  }

  async editAndResend(input: AgentChatEditInput): Promise<TurnResult> {
    return this.runtime.editAndResend(input);
  }

  async retry(input: AgentChatRetryInput = {}): Promise<TurnResult> {
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
