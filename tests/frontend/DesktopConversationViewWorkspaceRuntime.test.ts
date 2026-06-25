import { DesktopConversationViewWorkspaceRuntime } from '../../frontend/src/renderer/app/runtime/desktopConversationViewWorkspaceRuntime';
import type { ConversationView } from '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeContracts';

const {
  buildConversationViewWorkspaceMutation,
} = DesktopConversationViewWorkspaceRuntime;

function buildConversationView(conversationRef: string): ConversationView {
  return {
    conversationRef,
    rows: [],
    actions: {
      canEdit: false,
      canRetry: false,
    },
    revisions: [],
    activeRevisionId: null,
    liveTurn: null,
  };
}

describe('DesktopConversationViewWorkspaceRuntime', () => {
  test('returns null when workspace and latest view are already current', () => {
    const conversationView = buildConversationView('conv-1');
    const workspace = {
      conversationView,
      messages: [],
    };

    expect(buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
      isActiveWorkspace: true,
      latestConversationView: conversationView,
    })).toBeNull();
  });

  test('updates active workspace and latest conversation view together', () => {
    const previousView = buildConversationView('conv-1');
    const nextView = buildConversationView('conv-1');
    const workspace = {
      conversationView: previousView,
      messages: ['keep-ui-state'],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView: nextView,
      currentWorkspace: workspace,
      isActiveWorkspace: true,
      latestConversationView: previousView,
    });

    expect(mutation).toEqual({
      workspace: {
        conversationView: nextView,
        messages: ['keep-ui-state'],
      },
      hasLatestConversationViewUpdate: true,
      latestConversationView: nextView,
    });
    expect(mutation?.workspace).not.toBe(workspace);
  });

  test('does not update latest conversation view for inactive workspaces', () => {
    const previousView = buildConversationView('conv-old');
    const nextView = buildConversationView('conv-inactive');
    const latestConversationView = buildConversationView('conv-active');
    const workspace = {
      conversationView: previousView,
      messages: [],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView: nextView,
      currentWorkspace: workspace,
      isActiveWorkspace: false,
      latestConversationView,
    });

    expect(mutation).toEqual({
      workspace: {
        conversationView: nextView,
        messages: [],
      },
      hasLatestConversationViewUpdate: false,
      latestConversationView,
    });
  });

  test('can refresh only the active latest view without cloning workspace', () => {
    const conversationView = buildConversationView('conv-1');
    const workspace = {
      conversationView,
      messages: [],
    };

    const mutation = buildConversationViewWorkspaceMutation({
      conversationView,
      currentWorkspace: workspace,
      isActiveWorkspace: true,
      latestConversationView: null,
    });

    expect(mutation).toEqual({
      workspace,
      hasLatestConversationViewUpdate: true,
      latestConversationView: conversationView,
    });
    expect(mutation?.workspace).toBe(workspace);
  });
});
