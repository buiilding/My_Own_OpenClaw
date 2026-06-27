/**
 * Owns renderer chat workspace message state updates for store bindings.
 */

import type {
  ChatMessage,
} from './desktopChatMessageTypes';

type MessageWorkspace = {
  conversationView?: unknown | null;
  messages: ChatMessage[];
};

type WorkspaceMutationTarget<TWorkspace extends MessageWorkspace> = {
  normalizedConversationRef: string | null;
  workspaceRef: string;
  workspace: TWorkspace;
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

type ChatStreamMessageTarget = {
  id: string;
  sender?: string | null;
  type?: string | null;
  turnRef?: string | null;
};

type RendererAnnotationUpdate = Pick<ChatMessage, 'feedback'>;

type MessageStateDependencies<
  TState,
  TWorkspace extends MessageWorkspace,
> = {
  buildWorkspaceUpdate: (
    state: TState,
    workspaceRef: string,
    workspace: TWorkspace,
    extra?: Partial<TState>,
  ) => Partial<TState> | TState;
  recordTurnConversationRefs: (
    messages: ChatMessage[],
    conversationRef?: string | null,
  ) => void;
  resolveWorkspaceMutationTarget: (
    state: TState,
    conversationRef?: string | null,
  ) => WorkspaceMutationTarget<TWorkspace>;
};

function hasConversationView(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function selectRendererAnnotationUpdates(
  updates: Partial<ChatMessage>,
): Partial<RendererAnnotationUpdate> | null {
  const annotationUpdates: Partial<RendererAnnotationUpdate> = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'feedback')) {
    annotationUpdates.feedback = updates.feedback;
  }
  return Object.keys(annotationUpdates).length > 0 ? annotationUpdates : null;
}

function buildAddMessageStateUpdate<
  TState,
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
  if (hasConversationView(currentWorkspace.conversationView)) {
    return null;
  }
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
  deps.recordTurnConversationRefs([message], normalizedConversationRef);

  return deps.buildWorkspaceUpdate(state, workspaceRef, nextWorkspace);
}

function buildUpdateMessageStateUpdate<
  TState,
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
  if (hasConversationView(currentWorkspace.conversationView)) {
    const annotationUpdates = selectRendererAnnotationUpdates(updates);
    if (!annotationUpdates) {
      return null;
    }
    const existingAnnotationIndex = currentWorkspace.messages.findIndex((message) => message.id === id);
    const annotationMessage = existingAnnotationIndex >= 0
      ? {
        ...currentWorkspace.messages[existingAnnotationIndex],
        ...annotationUpdates,
      }
      : {
        id,
        text: '',
        sender: 'assistant' as const,
        ...annotationUpdates,
      };
    const nextMessages = existingAnnotationIndex >= 0
      ? currentWorkspace.messages.map((message, index) => (
        index === existingAnnotationIndex ? annotationMessage : message
      ))
      : [...currentWorkspace.messages, annotationMessage];
    const nextWorkspace = { ...currentWorkspace, messages: nextMessages };
    return deps.buildWorkspaceUpdate(state, workspaceRef, nextWorkspace);
  }
  const index = currentWorkspace.messages.findIndex((message) => message.id === id);
  if (index === -1) {
    return null;
  }

  const nextMessages = [...currentWorkspace.messages];
  nextMessages[index] = { ...nextMessages[index], ...updates };
  const nextWorkspace = { ...currentWorkspace, messages: nextMessages };
  if (updates.turnRef !== undefined) {
    deps.recordTurnConversationRefs([nextMessages[index]], normalizedConversationRef);
  }
  return deps.buildWorkspaceUpdate(state, workspaceRef, nextWorkspace);
}

function findLastMessage(
  messages: ChatStreamMessageTarget[],
  predicate: (message: ChatStreamMessageTarget) => boolean,
): ChatStreamMessageTarget | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (predicate(message)) {
      return message;
    }
  }
  return null;
}

function findLastMessageIdBySender(
  messages: ChatStreamMessageTarget[],
  sender: string,
  turnRef?: string,
): string | null {
  const lastMessage = findLastMessage(
    messages,
    (message) => (
      message.sender === sender
      && (!turnRef || message.turnRef === turnRef)
    ),
  );
  return lastMessage ? lastMessage.id : null;
}

function findLastAssistantLlmTextMessageId(
  messages: ChatStreamMessageTarget[],
  turnRef?: string,
): string | null {
  const lastMessage = findLastMessage(
    messages,
    (message) => (
      message.sender === 'assistant'
      && message.type === 'llm-text'
      && (!turnRef || message.turnRef === turnRef)
    ),
  );
  return lastMessage ? lastMessage.id : null;
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
  TState,
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
  if (hasConversationView(currentWorkspace.conversationView)) {
    return null;
  }
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
  TState,
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
  if (hasConversationView(currentWorkspace.conversationView)) {
    return null;
  }
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
  deps.recordTurnConversationRefs(messages, normalizedConversationRef);
  return deps.buildWorkspaceUpdate(state, workspaceRef, nextWorkspace);
}

export const DesktopChatWorkspaceMessageRuntime = Object.freeze({
  buildAddMessageStateUpdate,
  buildSetMessagesStateUpdate,
  buildUpdateStreamTargetMessageStateUpdate,
  buildUpdateMessageStateUpdate,
});
