/**
 * Covers chat box response. utils behavior in the frontend test suite.
 */

import { act } from '@testing-library/react';

const mockInvoke = jest.fn().mockResolvedValue({ success: true });
const mockSend = jest.fn();
const mockListeners = new Map();

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    send: (...args) => mockSend(...args),
    on: (channel, handler) => {
      mockListeners.set(channel, handler);
      return () => mockListeners.delete(channel);
    },
  },
  SEND_CHANNELS: {
    LIVE_SURFACE_TRACE: 'live-surface-trace',
  },
  INVOKE_CHANNELS: {
    SET_RESPONSEBOX_SIZE: 'set-responsebox-size',
    SET_RESPONSEBOX_HIT_TEST_ACTIVE: 'set-responsebox-hit-test-active',
    GET_SYSTEM_STATE: 'get-system-state',
  },
  ON_CHANNELS: {
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
    RESPONSE_OVERLAY_VISIBILITY: 'response-overlay-visibility',
  },
}));

jest.mock('../../src/renderer/infrastructure/markdown', () => {
  const actual = jest.requireActual('../../src/renderer/infrastructure/markdown');
  return {
    ...actual,
    toSanitizedMarkdownHtml: (text) => `<p>${text || ''}</p>`,
  };
});

import MinimalResponseOverlay from '../../src/renderer/features/minimalChatPill/components/MinimalResponseOverlay';
import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  clearPendingTurnInChatStore,
  setConversationViewInChatStore,
  setNoViewSdkLiveTurnInChatStore,
  setIsSendingInChatStore,
  setMessagesInChatStore,
  setThinkingStatusInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';

const DEFAULT_CHAT_WORKSPACE_REF = '__default__';
const WORKSPACE_MIRROR_FIELDS = [
  'messages',
  'isSending',
  'thinkingStatus',
  'thinkingSourceEventType',
  'compactionDebugInfo',
  'tokenCounts',
  'streamTracking',
  'sdkLiveTurn',
  'conversationView',
  'pendingTurn',
];

const originalSetChatStoreState = useChatStore.setState.bind(useChatStore);

function withActiveWorkspaceMirror(partial) {
  const state = useChatStore.getState();
  const workspaceRef = state.activeConversationRef || DEFAULT_CHAT_WORKSPACE_REF;
  const currentWorkspace = state.workspaces?.[workspaceRef];
  if (!currentWorkspace) {
    return partial;
  }
  let shouldMirror = false;
  const nextWorkspace = {
    ...currentWorkspace,
  };
  WORKSPACE_MIRROR_FIELDS.forEach((fieldName) => {
    if (Object.prototype.hasOwnProperty.call(partial, fieldName)) {
      nextWorkspace[fieldName] = partial[fieldName];
      shouldMirror = true;
    }
  });
  if (!shouldMirror) {
    return partial;
  }
  return {
    ...partial,
    workspaces: {
      ...state.workspaces,
      [workspaceRef]: nextWorkspace,
    },
  };
}

useChatStore.setState = (partial, replace) => {
  if (
    partial
    && typeof partial === 'object'
    && !Array.isArray(partial)
    && Array.isArray(partial.messages)
    && !Object.prototype.hasOwnProperty.call(partial, 'sdkLiveTurn')
  ) {
    const currentPhase = useChatStore.getState()?.sdkLiveTurn?.phase || null;
    const currentTurnProjection = partial.messages.length > 0
      ? buildCurrentTurnProjection(partial.messages, currentPhase)
      : null;
    return originalSetChatStoreState(withActiveWorkspaceMirror({
      ...partial,
      sdkLiveTurn: currentTurnProjection,
      conversationView: null,
    }), replace);
  }
  if (partial && typeof partial === 'object' && !Array.isArray(partial)) {
    return originalSetChatStoreState(withActiveWorkspaceMirror(partial), replace);
  }
  return originalSetChatStoreState(partial, replace);
};

function normalizeProjectionPhase(phase, messages) {
  if (phase === 'awaiting-first-chunk') {
    return 'awaiting';
  }
  if (phase === 'tool-call') {
    return 'tool_call';
  }
  if (phase === 'tool-output') {
    return 'tool_output';
  }
  if (phase === 'streaming' || phase === 'complete' || phase === 'error' || phase === 'idle') {
    return phase;
  }
  const latestAssistant = [...messages].reverse().find((message) => message?.sender === 'assistant');
  if (!latestAssistant) {
    return messages.length > 0 ? 'awaiting' : 'idle';
  }
  if (latestAssistant.type === 'error') {
    return 'error';
  }
  if (latestAssistant.type === 'tool-output') {
    return 'tool_output';
  }
  if (latestAssistant.type === 'tool-call' || latestAssistant.type === 'tool-explanation') {
    return 'tool_call';
  }
  return latestAssistant.isComplete === true ? 'complete' : 'streaming';
}

function buildToolEventsFromMessages(messages) {
  return messages
    .filter((message) => message?.sender === 'assistant')
    .map((message, index) => {
      if (message.type === 'tool-output') {
        return {
          id: message.id || `tool-output-${index}`,
          kind: 'tool_output',
          toolName: message.toolName || 'tool',
          status: message.status || 'success',
          text: message.text || '',
          toolOutputDetails: message.toolOutputDetails || {
            output: message.text || '',
          },
          toolMetadata: message.toolMetadata || null,
          screenshot: message.screenshot || null,
          screenshotRef: message.screenshotRef || null,
          screenshotUrl: message.screenshotUrl || null,
          screenshotContentType: message.screenshotContentType || null,
          executionTime: message.executionTime ?? null,
          success: message.success ?? (message.status === 'error' ? false : true),
          payload: {
            output: message.text || '',
          },
        };
      }
      if (message.type === 'search-source') {
        return {
          id: message.id || `tool-progress-${index}`,
          kind: 'tool_progress',
          toolName: message.toolName || 'web_search',
          status: message.status || 'success',
          text: message.text || '',
          payload: {},
        };
      }
      if (message.type === 'tool-call' || message.type === 'tool-explanation') {
        const modelFacingArgs = message.modelFacingToolCall?.arguments;
        const toolCallArgs = message.toolCallDetails?.parameters;
        const args = modelFacingArgs || toolCallArgs || {
          explanation: message.text || '',
        };
        return {
          id: message.id || `tool-call-${index}`,
          kind: 'tool_call',
          toolName: message.modelFacingToolCall?.name || message.toolCallDetails?.tool_name || message.toolName || 'tool',
          text: message.text || '',
          modelFacingToolCall: message.modelFacingToolCall || {
            name: message.toolCallDetails?.tool_name || message.toolName || 'tool',
            arguments: args,
          },
          toolArguments: args,
          toolCallDetails: message.toolCallDetails || {
            toolName: message.modelFacingToolCall?.name || message.toolName || 'tool',
          },
          toolMetadata: message.toolMetadata || null,
          payload: {
            toolName: message.modelFacingToolCall?.name || message.toolCallDetails?.tool_name || message.toolName || 'tool',
          },
        };
      }
      return null;
    })
    .filter(Boolean);
}

function buildCurrentTurnProjection(messages, phase = null) {
  const assistantMessages = messages.filter((message) => message?.sender === 'assistant');
  const latestTextMessage = [...assistantMessages].reverse().find((message) => (
    message.type === 'llm-text' || (!message.type && typeof message.text === 'string')
  ));
  const latestError = [...assistantMessages].reverse().find((message) => message.type === 'error');
  return {
    conversationRef: 'conv-test',
    turnRef: 'turn-test',
    phase: normalizeProjectionPhase(phase, messages),
    assistantText: latestTextMessage?.text || '',
    reasoningText: latestTextMessage?.thinkingText || null,
    toolEvents: buildToolEventsFromMessages(messages),
    lastError: latestError?.text || null,
  };
}

export function setChatState(messages) {
  const currentTurnProjection = messages.length > 0 ? buildCurrentTurnProjection(messages) : null;
  setMessagesInChatStore(messages);
  setIsSendingInChatStore(false);
  setThinkingStatusInChatStore(null);
  clearPendingTurnInChatStore();
  setNoViewSdkLiveTurnInChatStore(currentTurnProjection);
  setConversationViewInChatStore(null);
}

export function emitOverlayPhase(phase) {
  act(() => {
    const workspace = useChatStore.getState().getWorkspaceState();
    const currentTurnProjection = buildCurrentTurnProjection(workspace.messages || [], phase);
    setNoViewSdkLiveTurnInChatStore(currentTurnProjection);
    setConversationViewInChatStore(null);
  });
}

export function emitResponseOverlayPhasePayload(payload) {
  const onPhase = mockListeners.get('response-overlay-phase');
  expect(onPhase).toEqual(expect.any(Function));
  act(() => {
    onPhase(payload);
  });
}

export function emitOverlayVisibility(visible) {
  const onVisibility = mockListeners.get('response-overlay-visibility');
  expect(onVisibility).toEqual(expect.any(Function));
  act(() => {
    onVisibility({ visible: Boolean(visible) });
  });
}

export function resetChatBoxResponseTestState() {
  mockInvoke.mockReset();
  mockSend.mockReset();
  mockInvoke.mockImplementation((channel) => {
    if (channel === 'get-system-state') {
      return Promise.resolve({
        mouse_position: '(960, 540)',
        screen_resolution: '1920x1080',
      });
    }
    return Promise.resolve({ success: true });
  });
  mockListeners.clear();
  setChatState([]);
}

export {
  MinimalResponseOverlay as ChatBoxResponse,
  mockInvoke,
  mockSend,
  useChatStore,
};
