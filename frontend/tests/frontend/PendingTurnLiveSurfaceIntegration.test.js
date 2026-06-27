/**
 * Covers pending-turn live surface integration for renderer sends.
 */

import { waitFor } from '@testing-library/react';
import { DesktopChatSendPreparationRuntime } from '../../src/renderer/app/runtime/desktopChatSendPreparationRuntime';
import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  acceptPendingTurnInChatStore,
  applyPendingTurnBroadcastToChatStore,
  setNoViewSdkLiveTurnInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import {
  DesktopLiveTurnSurfaceRuntime,
} from '../../src/renderer/app/runtime/desktopLiveTurnSurfaceRuntime';
import {
  DesktopThreadPresentationRuntime,
} from '../../src/renderer/app/runtime/desktopThreadPresentationRuntime';
import {
  DesktopChatInterfacePresentationRuntime,
} from '../../src/renderer/app/runtime/desktopChatInterfacePresentationRuntime';
import {
  DesktopCurrentTurnMessageRuntime,
} from '../../src/renderer/app/runtime/desktopCurrentTurnMessageRuntime';
import {
  resetChatStoreForTests,
} from './chatStoreTestUtils';

const { buildThreadPresentationMessages } = DesktopThreadPresentationRuntime;
const { buildChatInterfacePresentationState } = DesktopChatInterfacePresentationRuntime;
const {
  prepareDesktopChatSend,
} = DesktopChatSendPreparationRuntime;
const {
  buildCurrentTurnMessagesFromPresentation,
} = DesktopCurrentTurnMessageRuntime;
const { resolveLiveTurnPresentationInput } = DesktopLiveTurnSurfaceRuntime;

const mockSend = jest.fn();
let resolveWorkspaceSelection = null;

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    send: (...args) => mockSend(...args),
    invoke: jest.fn(() => Promise.resolve({ success: true })),
  },
  INVOKE_CHANNELS: {
    SHOW_CHATBOX: 'show-chatbox',
  },
  SEND_CHANNELS: {
    DESKTOP_RUNTIME_PENDING_TURN: 'windie:pending-turn',
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopWorkspaceRuntimeClient', () => ({
  DesktopWorkspaceRuntimeClient: {
    fetchActiveWorkspaceSelection: jest.fn(() => new Promise((resolve) => {
      resolveWorkspaceSelection = resolve;
    })),
    getConversationWorkspaceBinding: jest.fn(() => ({
      workspacePath: '',
      workspaceName: '',
    })),
    setConversationWorkspaceBinding: jest.fn((_conversationRef, binding) => ({
      workspacePath: binding?.workspacePath || '',
      workspaceName: binding?.workspaceName || '',
    })),
    workspaceSelectionToBinding: jest.fn((workspace) => ({
      workspacePath: workspace?.activeWorkspacePath || '',
      workspaceName: workspace?.activeWorkspaceName || '',
    })),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => {
  let activeConversationRef = null;
  return {
    DesktopTranscriptSessionRuntimeClient: {
      getActiveConversationRef: jest.fn(() => activeConversationRef),
      setActiveConversationRef: jest.fn((conversationRef) => {
        activeConversationRef = conversationRef;
      }),
      updateTranscriptSession: jest.fn((conversationRef, userId) => ({
        conversationRef,
        userId,
      })),
      getTranscriptSessionInfo: jest.fn(() => ({
        conversationRef: activeConversationRef,
        userId: null,
      })),
    },
  };
});

jest.mock('../../src/renderer/app/runtime/desktopLiveTurnRuntimeClient', () => ({
  DesktopLiveTurnRuntimeClient: {
    sendQuery: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopSettingsRuntimeClient', () => ({
  DesktopSettingsRuntimeClient: {
    setModel: jest.fn(),
  },
}));

function resetStore() {
  resetChatStoreForTests();
  useChatStore.setState({
    activeConversationRef: null,
  });
}

function getActiveWorkspace() {
  return useChatStore.getState().getWorkspaceState();
}

function currentTurnWithPresentation() {
  return {
    conversationRef: 'conv_msg-1',
    turnRef: 'msg-1',
    phase: 'streaming',
    assistantText: 'Live answer',
    reasoningText: null,
    toolEvents: [],
    lastError: null,
    presentation: {
      typingVisible: false,
      overlayVisible: true,
      isBusy: true,
      hasVisibleContent: true,
      entries: [{
        id: 'conv_msg-1:msg-1:assistant',
        type: 'llm-text',
        text: 'Live answer',
        sourceEventType: 'assistant_delta',
        sourceChannel: 'sdk:current-turn',
        turnRef: 'msg-1',
      }],
      overlayIntent: {
        visible: true,
        mode: 'response',
        turnRef: 'msg-1',
        conversationRef: 'conv_msg-1',
        staleGuardRef: 'msg-1',
      },
    },
  };
}

describe('pending-turn live surface integration', () => {
  beforeEach(() => {
    mockSend.mockReset();
    resolveWorkspaceSelection = null;
    jest.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('msg-1');
    resetStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('accepts pending send before async prep, replays it, then hands off to SDK presentation', async () => {
    const preparePromise = prepareDesktopChatSend({
      payload: 'Live now',
      config: { include_query_screenshot: false },
      dependencies: {
        acceptPendingTurn: acceptPendingTurnInChatStore,
        getActiveConversationRef: () => useChatStore.getState().activeConversationRef,
        getSendReadModel: () => {
          const workspace = getActiveWorkspace();
          return {
            conversationView: workspace.conversationView,
            messages: workspace.messages,
          };
        },
        setChatActiveConversationRef: useChatStore.getState().setActiveConversationRef,
      },
      senderSurface: 'overlay-chatbox',
      sendLifecycle: {
        shouldCaptureQueryScreenshot: false,
        shouldReturnToChatboxOnSend: false,
        surfaceReason: 'overlay-chatbox',
      },
    });

    await waitFor(() => {
      expect(getActiveWorkspace().pendingTurn).toEqual(expect.objectContaining({
        conversationRef: 'conv_msg-1',
        turnRef: 'msg-1',
        text: 'Live now',
      }));
    });

    let state = getActiveWorkspace();
    expect(state.messages).toEqual([]);
    expect(buildChatInterfacePresentationState({
      activeConversationRef: 'conv_msg-1',
      messages: state.messages,
      pendingTurn: state.pendingTurn,
      sdkLiveTurn: state.sdkLiveTurn,
    }).renderedMessages).toEqual([
      expect.objectContaining({
        id: 'msg-1-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'Live now',
        turnRef: 'msg-1',
      }),
    ]);
    expect(resolveLiveTurnPresentationInput({
      messages: state.messages,
      pendingTurn: state.pendingTurn,
      sdkLiveTurn: state.sdkLiveTurn,
    })).toMatchObject({
      source: 'pending-turn',
      phase: 'awaiting-first-chunk',
      isBusy: true,
    });
    expect(mockSend).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'pending',
      pendingTurn: state.pendingTurn,
    });

    const pendingTurn = state.pendingTurn;
    resetStore();
    applyPendingTurnBroadcastToChatStore({
      kind: 'pending',
      pendingTurn,
    });
    state = getActiveWorkspace();
    expect(resolveLiveTurnPresentationInput({
      messages: state.messages,
      pendingTurn: state.pendingTurn,
      sdkLiveTurn: state.sdkLiveTurn,
    })).toMatchObject({
      source: 'pending-turn',
      phase: 'awaiting-first-chunk',
      isBusy: true,
    });

    const currentTurnProjection = currentTurnWithPresentation();
    setNoViewSdkLiveTurnInChatStore(
      currentTurnProjection,
      currentTurnProjection.conversationRef,
    );
    state = getActiveWorkspace();
    expect(state.pendingTurn).toBeNull();
    expect(resolveLiveTurnPresentationInput({
      messages: state.messages,
      pendingTurn: state.pendingTurn,
      sdkLiveTurn: state.sdkLiveTurn,
    })).toMatchObject({
      source: 'sdk-current-turn',
      phase: 'streaming',
    });

    const dashboardMessages = buildThreadPresentationMessages(state.messages, {
      sdkLiveTurn: currentTurnProjection,
      activeConversationRef: 'conv_msg-1',
    }).filter((message) => message.sourceChannel === 'sdk:current-turn');
    const overlayMessages = buildCurrentTurnMessagesFromPresentation(currentTurnProjection);
    expect(dashboardMessages).toEqual(overlayMessages);
    expect(overlayMessages).toEqual([
      expect.objectContaining({
        text: 'Live answer',
        sender: 'assistant',
        type: 'llm-text',
      }),
    ]);

    resolveWorkspaceSelection?.({ workspace: null });
    await expect(preparePromise).resolves.toEqual(expect.objectContaining({
      conversationRef: 'conv_msg-1',
      turnRef: 'msg-1',
    }));
  });
});
