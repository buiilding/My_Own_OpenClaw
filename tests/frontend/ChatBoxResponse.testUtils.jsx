import { act, render, screen, waitFor } from '@testing-library/react';

import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../../frontend/src/renderer/features/chat/constants/toolGhostRuntime';

const mockInvoke = jest.fn().mockResolvedValue({ success: true });
const mockListeners = new Map();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
    on: (channel, handler) => {
      mockListeners.set(channel, handler);
      return () => mockListeners.delete(channel);
    },
  },
  INVOKE_CHANNELS: {
    SET_RESPONSEBOX_SIZE: 'set-responsebox-size',
    GET_SYSTEM_STATE: 'get-system-state',
  },
  ON_CHANNELS: {
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/markdown', () => ({
  toSanitizedMarkdownHtml: (text) => `<p>${text || ''}</p>`,
}));

import ChatBoxResponse from '../../frontend/src/renderer/features/chat/components/ChatBoxResponse';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';

export function setChatState(messages) {
  useChatStore.setState({
    messages,
    isSending: false,
    thinkingStatus: null,
  });
}

export function buildClickToolCallText() {
  return JSON.stringify({
    name: 'mouse_control',
    arguments: { action: 'click', explanation: 'Clicking Chrome icon' },
    metadata: {
      coordinate_contract: {
        target_display_size: [1000, 1000],
        normalized_coordinates: { x: 800, y: 750 },
      },
    },
  });
}

export function parsePercentValue(rawValue) {
  return Number.parseFloat((rawValue || '').replace('%', ''));
}

export function emitOverlayPhase(phase) {
  const onPhase = mockListeners.get('response-overlay-phase');
  expect(onPhase).toEqual(expect.any(Function));
  act(() => {
    onPhase({ phase });
  });
}

export async function renderToolCallGhost({ userText, toolText }) {
  setChatState([
    { id: 'user-1', text: userText, sender: 'user' },
    {
      id: 'tool-1',
      text: toolText,
      sender: 'assistant',
      type: 'tool-call',
    },
  ]);

  const renderResult = render(<ChatBoxResponse />);
  emitOverlayPhase('tool-call');

  await waitFor(() => {
    expect(screen.getByLabelText('Assistant tool action preview')).toBeInTheDocument();
  });

  return renderResult;
}

export function resetChatBoxResponseTestState() {
  mockInvoke.mockReset();
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
  ChatBoxResponse,
  TOOL_GHOST_CLICK_SYNC_DELAY_MS,
  mockInvoke,
  useChatStore,
};
