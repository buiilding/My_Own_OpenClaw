/**
 * Owns renderer chat workspace message state updates for store bindings.
 */

import type {
  ChatMessage,
} from './desktopChatMessageTypes';
import {
  DesktopChatStreamMessageUpdateRuntime,
} from './desktopChatStreamMessageUpdateRuntime';

const {
  findLastAssistantLlmTextMessageId,
  findLastMessageIdBySender,
} = DesktopChatStreamMessageUpdateRuntime;

type TurnConversationRefs = Record<string, string>;

type MessageWorkspace = {
  messages: ChatMessage[];
};

type WorkspaceMutationTarget<TWorkspace extends MessageWorkspace> = {
  normalizedConversationRef: string | null;
  workspaceRef: string;
  workspace: TWorkspace;
};

type MessageStateSnapshot = {
  turnConversationRefs: TurnConversationRefs;
};

type StreamMessageTarget =
  | {
      kind: 'last_by_sender';
      sender: ChatMessage['sender'];
      turnRef?: string | null;
    }
  | {
      kind: 'last_assistant_llm_text';
      turnRef?: string | null;
    };

type MessageStateDependencies<
  TState extends MessageStateSnapshot,
  TWorkspace extends MessageWorkspace,
> = {
  buildWorkspaceUpdate: (
    state: TState,
    workspaceRef: string,
    workspace: TWorkspace,
    extra?: Partial<TState>,
  ) => Partial<TState> | TState;
  mergeTurnConversationRefs: (
    currentTurnConversationRefs: TurnConversationRefs,
    messages: ChatMessage[],
    conversationRef?: string | null,
  ) => TurnConversationRefs;
  resolveWorkspaceMutationTarget: (
    state: TState,
    conversationRef?: string | null,
  ) => WorkspaceMutationTarget<TWorkspace>;
};

function buildAddMessageStateUpdate<
  TState extends MessageStateSnapshot,
  TWorkspace extends MessageWorkspace,
>({
  conversationRef = null,
  deps,
  message,
  state,
}: {
  conversationRef?: string | null;
  deps: MessageStateDependencies<TState, TWorkspace>;
  message: ChatMessage;
  state: TState;
}): Partial<TState> | TState {
  const {
    normalizedConversationRef,
    workspaceRef,
    workspace: currentWorkspace,
  } = deps.resolveWorkspaceMutationTarget(state, conversationRef);
  const existingMessageIndex = currentWorkspace.messages.findIndex(
    (existingMessage) => existingMessage.id === message.id,
  );
  const nextMessages = existingMessageIndex === -1
    ? [...currentWorkspace.messages, message]
    : currentWorkspace.messages.map((existingMessage, index) => (
      index === existingMessageIndex
        ? { ...existingMessage, ...message }
        : existingMessage
    ));
  const nextWorkspace = {
    ...currentWorkspace,
    messages: nextMessages,
  };
  const nextTurnConversationRefs = deps.mergeTurnConversationRefs(
    state.turnConversationRefs,
    [message],
    normalizedConversationRef,
  );

  return deps.buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
    turnConversationRefs: nextTurnConversationRefs,
  } as Partial<TState>);
}

function buildUpdateMessageStateUpdate<
  TState extends MessageStateSnapshot,
  TWorkspace extends MessageWorkspace,
>({
  conversationRef = null,
  deps,
  id,
  state,
  updates,
}: {
  conversationRef?: string | null;
  deps: MessageStateDependencies<TState, TWorkspace>;
  id: string;
  state: TState;
  updates: Partial<ChatMessage>;
}): Partial<TState> | TState | null {
  const {
    normalizedConversationRef,
    workspaceRef,
    workspace: currentWorkspace,
  } = deps.resolveWorkspaceMutationTarget(state, conversationRef);
  const index = currentWorkspace.messages.findIndex((message) => message.id === id);
  if (index === -1) {
    return null;
  }

  const nextMessages = [...currentWorkspace.messages];
  nextMessages[index] = { ...nextMessages[index], ...updates };
  const nextWorkspace = { ...currentWorkspace, messages: nextMessages };
  const nextTurnConversationRefs = deps.mergeTurnConversationRefs(
    state.turnConversationRefs,
    updates.turnRef !== undefined ? [nextMessages[index]] : [],
    normalizedConversationRef,
  );
  return deps.buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
    turnConversationRefs: nextTurnConversationRefs,
  } as Partial<TState>);
}

function resolveStreamMessageTargetId(
  messages: ChatMessage[],
  target: StreamMessageTarget,
): string | null {
  if (target.kind === 'last_by_sender') {
    return findLastMessageIdBySender(
      messages,
      target.sender,
      target.turnRef ?? undefined,
    );
  }
  if (target.kind === 'last_assistant_llm_text') {
    return findLastAssistantLlmTextMessageId(
      messages,
      target.turnRef ?? undefined,
    );
  }
  return null;
}

function buildUpdateStreamTargetMessageStateUpdate<
  TState extends MessageStateSnapshot,
  TWorkspace extends MessageWorkspace,
>({
  conversationRef = null,
  deps,
  state,
  target,
  updates,
}: {
  conversationRef?: string | null;
  deps: MessageStateDependencies<TState, TWorkspace>;
  state: TState;
  target: StreamMessageTarget;
  updates: Partial<ChatMessage>;
}): Partial<TState> | TState | null {
  const {
    workspace: currentWorkspace,
  } = deps.resolveWorkspaceMutationTarget(state, conversationRef);
  const targetMessageId = resolveStreamMessageTargetId(currentWorkspace.messages, target);
  if (!targetMessageId) {
    return null;
  }
  return buildUpdateMessageStateUpdate({
    conversationRef,
    deps,
    id: targetMessageId,
    state,
    updates,
  });
}

function buildSetMessagesStateUpdate<
  TState extends MessageStateSnapshot,
  TWorkspace extends MessageWorkspace,
>({
  conversationRef = null,
  deps,
  messages,
  state,
}: {
  conversationRef?: string | null;
  deps: MessageStateDependencies<TState, TWorkspace>;
  messages: ChatMessage[];
  state: TState;
}): Partial<TState> | TState | null {
  const {
    normalizedConversationRef,
    workspaceRef,
    workspace: currentWorkspace,
  } = deps.resolveWorkspaceMutationTarget(state, conversationRef);
  if (
    currentWorkspace.messages === messages
    || (
      currentWorkspace.messages.length === messages.length
      && currentWorkspace.messages.every((message, index) => message === messages[index])
    )
  ) {
    return null;
  }
  const nextWorkspace = { ...currentWorkspace, messages };
  const nextTurnConversationRefs = deps.mergeTurnConversationRefs(
    state.turnConversationRefs,
    messages,
    normalizedConversationRef,
  );
  return deps.buildWorkspaceUpdate(state, workspaceRef, nextWorkspace, {
    turnConversationRefs: nextTurnConversationRefs,
  } as Partial<TState>);
}

export const DesktopChatWorkspaceMessageRuntime = Object.freeze({
  buildAddMessageStateUpdate,
  buildSetMessagesStateUpdate,
  buildUpdateStreamTargetMessageStateUpdate,
  buildUpdateMessageStateUpdate,
});
