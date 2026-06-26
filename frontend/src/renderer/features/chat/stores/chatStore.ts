/**
 * Chat Store (Zustand).
 * Holds active workspace state, selectors, and response-overlay dismissal state.
 */

import { create } from 'zustand';
import {
  buildActiveConversationWorkspaceUpdate,
  createInitialWorkspaceRecord,
  readWorkspaceState,
  resolveWorkspaceKey,
  selectActiveWorkspaceReadModelState,
} from '../../../app/runtime/desktopChatWorkspaceStateRuntime';
import type { ChatWorkspaceState } from '../../../app/runtime/desktopChatWorkspaceStateRuntime';
import {
  DesktopChatInterfaceSelectorRuntime,
} from '../../../app/runtime/desktopChatInterfaceSelectorRuntime';
import {
  DesktopResponseOverlayViewRuntime,
} from '../../../app/runtime/desktopResponseOverlayViewRuntime';
import type {
  ResponseOverlayDismissalInput,
} from '../../../app/runtime/desktopResponseOverlayViewRuntime';

const {
  buildChatInterfaceSelectorState,
  buildChatInterfaceSurfaceSelectorState,
  buildChatSendReadModelSelectorState,
  buildLiveTurnSurfaceSelectorState,
} = DesktopChatInterfaceSelectorRuntime;
const {
  buildDismissResponseOverlayEntryStateUpdate,
  isResponseOverlayEntryDismissedInState,
} = DesktopResponseOverlayViewRuntime;
export type {
  StreamPhase,
  StreamTracking,
} from '../../../app/runtime/desktopChatStreamTrackingRuntime';

/**
 * Chat store state
 */
export interface ChatState {
  activeConversationRef: string | null;
  workspaces: Record<string, ChatWorkspaceState>;
  dismissedResponseOverlayEntries: Record<string, true>;

  getWorkspaceState: (conversationRef?: string | null) => ChatWorkspaceState;
  setActiveConversationRef: (conversationRef: string | null) => void;
  dismissResponseOverlayEntry: (input: ResponseOverlayDismissalInput) => void;
  isResponseOverlayEntryDismissed: (input: ResponseOverlayDismissalInput) => boolean;

}

export function selectChatInterfaceState(state: ChatState) {
  return buildChatInterfaceSelectorState({
    activeConversationRef: state.activeConversationRef,
    activeWorkspace: selectActiveWorkspaceReadModelState(state),
  });
}

export function selectChatSendReadModel(state: ChatState) {
  return buildChatSendReadModelSelectorState({
    activeWorkspace: selectActiveWorkspaceReadModelState(state),
  });
}

export function selectChatInterfaceSurfaceState(state: ChatState) {
  return buildChatInterfaceSurfaceSelectorState({
    activeWorkspace: selectActiveWorkspaceReadModelState(state),
  });
}

export function selectLiveTurnSurfaceState(state: ChatState) {
  return buildLiveTurnSurfaceSelectorState({
    activeConversationRef: state.activeConversationRef,
    activeWorkspace: selectActiveWorkspaceReadModelState(state),
  });
}

/**
 * Chat store
 * Uses shallow equality for better performance with Zustand
 */
export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  activeConversationRef: null,
  workspaces: createInitialWorkspaceRecord(),
  dismissedResponseOverlayEntries: {},
  getWorkspaceState: (conversationRef) => {
    const state = get();
    const workspaceRef = resolveWorkspaceKey(conversationRef, state.activeConversationRef);
    return readWorkspaceState(state, workspaceRef);
  },

  setActiveConversationRef: (conversationRef) =>
    set((state) => buildActiveConversationWorkspaceUpdate(state, conversationRef)),

  dismissResponseOverlayEntry: (input) =>
    set((state) => buildDismissResponseOverlayEntryStateUpdate(state, input) || state),

  isResponseOverlayEntryDismissed: (input) =>
    isResponseOverlayEntryDismissedInState(get(), input),

}));
