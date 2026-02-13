import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import ChatBoxResponse from '../../frontend/src/renderer/features/chat/components/ChatBoxResponse';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';

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
  },
  ON_CHANNELS: {
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/markdown', () => ({
  toSanitizedMarkdownHtml: (text) => `<p>${text || ''}</p>`,
}));

function setChatState(messages) {
  useChatStore.setState({
    messages,
    isSending: false,
    thinkingStatus: null,
  });
}

describe('ChatBoxResponse', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockListeners.clear();
    setChatState([]);
  });

  test('shows tool-call response immediately when tool-call arrives before llm-text', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      { id: 'tool-1', text: 'tool-call payload', sender: 'assistant', type: 'tool-call' },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('tool-call payload')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('shows awaiting indicator when no assistant response exists yet', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
    });
  });

  test('hides awaiting indicator after overlay phase moves to streaming', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
    ]);

    render(<ChatBoxResponse />);

    const onPhase = mockListeners.get('response-overlay-phase');
    expect(onPhase).toEqual(expect.any(Function));

    act(() => {
      onPhase({ phase: 'streaming' });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
    });
  });
});
