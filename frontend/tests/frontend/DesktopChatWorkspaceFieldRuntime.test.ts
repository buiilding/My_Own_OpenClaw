/**
 * Covers simple chat workspace field state updates.
 */

import { DesktopChatWorkspaceFieldRuntime } from '../../src/renderer/app/runtime/desktopChatWorkspaceFieldRuntime';

const { buildSetWorkspaceFieldStateUpdate } = DesktopChatWorkspaceFieldRuntime;

describe('DesktopChatWorkspaceFieldRuntime', () => {
  test('buildSetWorkspaceFieldStateUpdate resolves workspace and applies changed field', () => {
    const state = {
      activeConversationRef: 'conv-1',
      workspaces: {
        'conv-1': {
          isSending: false,
          thinkingStatus: null,
        },
      },
    };
    const deps = {
      buildWorkspaceUpdate: jest.fn((currentState, workspaceRef, nextWorkspace) => ({
        ...currentState,
        workspaces: {
          ...currentState.workspaces,
          [workspaceRef]: nextWorkspace,
        },
      })),
      readWorkspaceState: jest.fn((currentState, workspaceRef) => currentState.workspaces[workspaceRef]),
      resolveWorkspaceKey: jest.fn(() => 'conv-1'),
    };

    const nextState = buildSetWorkspaceFieldStateUpdate({
      conversationRef: 'conv-1',
      deps,
      field: 'isSending',
      state,
      value: true,
    });

    expect(deps.resolveWorkspaceKey).toHaveBeenCalledWith('conv-1', 'conv-1');
    expect(deps.readWorkspaceState).toHaveBeenCalledWith(state, 'conv-1');
    expect(deps.buildWorkspaceUpdate).toHaveBeenCalledWith(
      state,
      'conv-1',
      expect.objectContaining({
        isSending: true,
        thinkingStatus: null,
      }),
    );
    expect(nextState).toEqual(expect.objectContaining({
      workspaces: {
        'conv-1': expect.objectContaining({
          isSending: true,
        }),
      },
    }));
  });

  test('buildSetWorkspaceFieldStateUpdate no-ops when field value is unchanged', () => {
    const state = {
      activeConversationRef: 'conv-1',
      workspaces: {
        'conv-1': {
          isSending: false,
        },
      },
    };
    const deps = {
      buildWorkspaceUpdate: jest.fn(),
      readWorkspaceState: jest.fn((currentState, workspaceRef) => currentState.workspaces[workspaceRef]),
      resolveWorkspaceKey: jest.fn(() => 'conv-1'),
    };

    const nextState = buildSetWorkspaceFieldStateUpdate({
      deps,
      field: 'isSending',
      state,
      value: false,
    });

    expect(nextState).toBeNull();
    expect(deps.buildWorkspaceUpdate).not.toHaveBeenCalled();
  });
});
