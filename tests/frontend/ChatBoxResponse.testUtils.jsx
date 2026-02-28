import { act } from '@testing-library/react';

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
    RESPONSE_OVERLAY_VISIBILITY: 'response-overlay-visibility',
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

export function emitOverlayPhase(phase) {
  const onPhase = mockListeners.get('response-overlay-phase');
  expect(onPhase).toEqual(expect.any(Function));
  act(() => {
    onPhase({ phase });
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
  mockInvoke,
  useChatStore,
};
