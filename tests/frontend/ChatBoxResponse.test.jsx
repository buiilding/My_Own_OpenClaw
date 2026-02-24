import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import ChatBoxResponse from '../../frontend/src/renderer/features/chat/components/ChatBoxResponse';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
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

function setChatState(messages) {
  useChatStore.setState({
    messages,
    isSending: false,
    thinkingStatus: null,
  });
}

function buildClickToolCallText() {
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

describe('ChatBoxResponse', () => {
  function emitOverlayPhase(phase) {
    const onPhase = mockListeners.get('response-overlay-phase');
    expect(onPhase).toEqual(expect.any(Function));
    act(() => {
      onPhase({ phase });
    });
  }

  async function renderToolCallGhost({ userText, toolText }) {
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

  beforeEach(() => {
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
  });

  test('does not render tool-call response pane before llm text', async () => {
    setChatState([
      { id: 'user-1', text: 'run command', sender: 'user' },
      { id: 'tool-1', text: 'tool-call payload', sender: 'assistant', type: 'tool-call' },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.queryByText('tool-call payload')).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
  });

  test('shows tool-action ghost during tool-call phase and hides typing indicator', async () => {
    await renderToolCallGhost({
      userText: 'run command',
      toolText: JSON.stringify({
        name: 'mouse_control',
        arguments: { action: 'click', explanation: 'Clicking Chrome icon' },
      }),
    });
    expect(screen.getByText('Clicking Chrome icon')).toBeInTheDocument();
    expect(screen.queryByLabelText('Assistant is awaiting reply')).not.toBeInTheDocument();
  });

  test('uses current mouse position as click-ghost animation start point', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'get-system-state') {
        return Promise.resolve({
          mouse_position: '(100, 120)',
          screen_resolution: '1000x1000',
        });
      }
      return Promise.resolve({ success: true });
    });

    const { container } = await renderToolCallGhost({
      userText: 'run command',
      toolText: buildClickToolCallText(),
    });

    const ghostTrack = container.querySelector('.chatbox-tool-ghost-track');
    expect(ghostTrack).toBeTruthy();
    expect(ghostTrack.classList.contains('is-click-animating')).toBe(true);

    await waitFor(() => {
      expect(ghostTrack.style.getPropertyValue('--ghost-start-offset-x')).not.toBe('0px');
      expect(ghostTrack.style.getPropertyValue('--ghost-start-offset-y')).not.toBe('0px');
      expect(ghostTrack.style.getPropertyValue('--ghost-end-offset-x')).not.toBe('0px');
      expect(ghostTrack.style.getPropertyValue('--ghost-end-offset-y')).not.toBe('0px');
    });
  });

  test('maps click target from raw coordinates when target display size is missing', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'get-system-state') {
        return Promise.resolve({
          mouse_position: '(100, 100)',
          screen_resolution: '1000x1000',
        });
      }
      return Promise.resolve({ success: true });
    });

    const { container } = await renderToolCallGhost({
      userText: 'run command',
      toolText: JSON.stringify({
        name: 'mouse_control',
        arguments: { action: 'click', explanation: 'Clicking Chrome icon', x: 900, y: 800 },
        metadata: {
          coordinate_contract: {
            target_display_size: null,
            normalized_coordinates: { x: 900, y: 800 },
          },
        },
      }),
    });

    const ghostTrack = container.querySelector('.chatbox-tool-ghost-track');
    expect(ghostTrack).toBeTruthy();
    await waitFor(() => {
      expect(ghostTrack.classList.contains('is-targeted')).toBe(true);
      expect(ghostTrack.style.getPropertyValue('--ghost-end-offset-x')).not.toBe('0px');
      expect(ghostTrack.style.getPropertyValue('--ghost-end-offset-y')).not.toBe('0px');
    });
  });

  test('hides click ghost immediately after full click animation timeline', async () => {
    jest.useFakeTimers();
    try {
      setChatState([
        { id: 'user-1', text: 'run command', sender: 'user' },
        {
          id: 'tool-1',
          text: buildClickToolCallText(),
          sender: 'assistant',
          type: 'tool-call',
        },
      ]);

      render(<ChatBoxResponse />);
      emitOverlayPhase('tool-call');
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByLabelText('Assistant tool action preview')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(TOOL_GHOST_CLICK_SYNC_DELAY_MS - 1);
      });
      expect(screen.getByLabelText('Assistant tool action preview')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.queryByLabelText('Assistant tool action preview')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test('uses coordinate contract metadata to position targeted tool ghost preview', async () => {
    const { container } = await renderToolCallGhost({
      userText: 'open chrome',
      toolText: JSON.stringify({
        name: 'mouse_control',
        args: { explanation: 'Clicking Chrome icon' },
        metadata: {
          coordinate_contract: {
            target_display_size: [1920, 1080],
            normalized_coordinates: { x: 1600, y: 900 },
          },
        },
      }),
    });

    const ghostTrack = container.querySelector('.chatbox-tool-ghost-track');
    expect(ghostTrack).toBeTruthy();
    expect(ghostTrack.classList.contains('is-targeted')).toBe(true);
    expect(ghostTrack.style.getPropertyValue('--ghost-offset-x')).not.toBe('0px');
    expect(ghostTrack.style.getPropertyValue('--ghost-offset-y')).not.toBe('0px');
  });

  test('renders a target rectangle when target_rect metadata is present', async () => {
    const { container } = await renderToolCallGhost({
      userText: 'click panel',
      toolText: JSON.stringify({
        name: 'mouse_control',
        args: { explanation: 'Clicking panel' },
        metadata: {
          target_rect: { x: 100, y: 200, width: 500, height: 350 },
          coordinate_contract: {
            target_display_size: [1920, 1080],
          },
        },
      }),
    });

    const ghostTrack = container.querySelector('.chatbox-tool-ghost-track');
    expect(ghostTrack).toBeTruthy();
    expect(ghostTrack.classList.contains('has-rect')).toBe(true);
    expect(ghostTrack.style.getPropertyValue('--ghost-rect-left')).toBeTruthy();
    expect(ghostTrack.style.getPropertyValue('--ghost-rect-width')).toBeTruthy();
    expect(container.querySelector('.chatbox-tool-ghost-target-rect')).toBeTruthy();
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

  test('incomplete llm response is visible but not closeable', async () => {
    setChatState([
      { id: 'user-1', text: 'question', sender: 'user' },
      {
        id: 'assistant-1',
        text: 'partial answer',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
      },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('partial answer')).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', {
      name: 'Response still streaming',
    });
    expect(closeButton).toBeDisabled();
  });

  test('error response can be closed and stays dismissed', async () => {
    setChatState([
      { id: 'user-1', text: 'question', sender: 'user' },
      {
        id: 'assistant-err',
        text: 'something failed',
        sender: 'assistant',
        type: 'error',
        isComplete: true,
      },
    ]);

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText('something failed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close response' }));

    await waitFor(() => {
      expect(screen.queryByText('something failed')).not.toBeInTheDocument();
    });
  });

  test('shows top overflow indicator when response pane is scrolled above bottom', async () => {
    setChatState([
      { id: 'user-1', text: 'question', sender: 'user' },
      {
        id: 'assistant-1',
        text: 'line 1\nline 2\nline 3\nline 4\nline 5',
        sender: 'assistant',
        type: 'llm-text',
        isComplete: false,
      },
    ]);

    const { container } = render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByText(/line 1/)).toBeInTheDocument();
    });

    const responsePane = container.querySelector('.chatbox-response-pill');
    expect(responsePane).toBeTruthy();

    Object.defineProperty(responsePane, 'scrollHeight', {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(responsePane, 'clientHeight', {
      value: 180,
      configurable: true,
    });
    Object.defineProperty(responsePane, 'scrollTop', {
      value: 120,
      writable: true,
      configurable: true,
    });

    fireEvent.scroll(responsePane);

    await waitFor(() => {
      expect(responsePane.classList.contains('has-overflow-above')).toBe(true);
    });
  });

  test('renders thinking text as transparent stream while awaiting reply', async () => {
    setChatState([
      { id: 'user-1', text: 'think', sender: 'user' },
    ]);
    useChatStore.setState({
      thinkingStatus: 'step 1\nstep 2',
    });

    render(<ChatBoxResponse />);

    await waitFor(() => {
      expect(screen.getByLabelText('Assistant reasoning stream')).toBeInTheDocument();
    });
    expect(screen.getByText(/step 1/)).toBeInTheDocument();
    expect(screen.getByLabelText('Assistant is awaiting reply')).toBeInTheDocument();
  });
});
