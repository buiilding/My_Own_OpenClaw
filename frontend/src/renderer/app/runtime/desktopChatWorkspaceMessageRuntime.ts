/**
 * Owns renderer chat workspace message state updates for store bindings.
 */

import type {
  ChatMessage,
} from './desktopChatMessageTypes';
import {
  DesktopConversationViewWorkspaceRuntime,
} from './desktopConversationViewWorkspaceRuntime';

const {
  hasWorkspaceConversationView,
} = DesktopConversationViewWorkspaceRuntime;

type MessageWorkspace = {
  conversationView?: unknown | null;
  messages: ChatMessage[];
  rendererAnnotations?: RendererAnnotationRecord[];
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

type RendererAnnotationRecord = {
  feedback?: ChatMessage['feedback'];
  id: string;
};

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

function selectRendererAnnotationUpdates(
  updates: Partial<ChatMessage>,
): Partial<RendererAnnotationUpdate> | null {
  const annotationUpdates: Partial<RendererAnnotationUpdate> = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'feedback')) {
    annotationUpdates.feedback = updates.feedback;
  }
  return Object.keys(annotationUpdates).length > 0 ? annotationUpdates : null;
}

function exactAnnotationRowId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function updateRendererAnnotations(
  rendererAnnotations: RendererAnnotationRecord[] | undefined,
  id: string,
  updates: Partial<RendererAnnotationUpdate>,
): RendererAnnotationRecord[] {
  const currentAnnotations = Array.isArray(rendererAnnotations)
    ? rendererAnnotations
    : [];
  const existingAnnotationIndex = currentAnnotations.findIndex((annotation) => annotation.id === id);
  const nextAnnotation = existingAnnotationIndex >= 0
    ? {
      ...currentAnnotations[existingAnnotationIndex],
      ...updates,
    }
    : {
      id,
      ...updates,
    };
  return existingAnnotationIndex >= 0
    ? currentAnnotations.map((annotation, index) => (
      index === existingAnnotationIndex ? nextAnnotation : annotation
    ))
    : [...currentAnnotations, nextAnnotation];
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
  if (hasWorkspaceConversationView(currentWorkspace)) {
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
  if (hasWorkspaceConversationView(currentWorkspace)) {
    const annotationUpdates = selectRendererAnnotationUpdates(updates);
    const annotationRowId = exactAnnotationRowId(id);
    if (!annotationUpdates || !annotationRowId) {
      return null;
    }
    const nextWorkspace = {
      ...currentWorkspace,
      rendererAnnotations: updateRendererAnnotations(
        currentWorkspace.rendererAnnotations,
        annotationRowId,
        annotationUpdates,
      ),
    };
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
  if (hasWorkspaceConversationView(currentWorkspace)) {
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
  if (hasWorkspaceConversationView(currentWorkspace)) {
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
