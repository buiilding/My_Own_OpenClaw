import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import {
  ChatBoxResponse,
  TOOL_GHOST_CLICK_SYNC_DELAY_MS,
  buildClickToolCallText,
  emitOverlayPhase,
  mockInvoke,
  parsePercentValue,
  renderToolCallGhost,
  resetChatBoxResponseTestState,
  setChatState,
} from './ChatBoxResponse.testUtils';

describe('ChatBoxResponse tool ghost behavior', () => {
  beforeEach(() => {
    resetChatBoxResponseTestState();
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

  test('renders target ripple at target coordinate for click-like ghost actions', async () => {
    const { container } = await renderToolCallGhost({
      userText: 'run command',
      toolText: buildClickToolCallText(),
    });

    const ghostRipple = container.querySelector('.chatbox-tool-ghost-target-ripple');
    expect(ghostRipple).toBeTruthy();
    expect(ghostRipple.classList.contains('is-click-timeline')).toBe(true);
  });

  test('uses scroll tool explanation as ghost label text', async () => {
    await renderToolCallGhost({
      userText: 'scroll page',
      toolText: JSON.stringify({
        name: 'scroll_control',
        args: { explanation: 'Scrolling down to next section', x: 640, y: 420 },
        metadata: {
          coordinate_contract: {
            target_display_size: [1280, 720],
          },
        },
      }),
    });

    expect(screen.getByText('Scrolling down to next section')).toBeInTheDocument();
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
      const startX = parsePercentValue(ghostTrack.style.getPropertyValue('--ghost-start-left'));
      const startY = parsePercentValue(ghostTrack.style.getPropertyValue('--ghost-start-top'));
      const endX = parsePercentValue(ghostTrack.style.getPropertyValue('--ghost-end-left'));
      const endY = parsePercentValue(ghostTrack.style.getPropertyValue('--ghost-end-top'));
      expect(startX).not.toBe(endX);
      expect(startY).not.toBe(endY);
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
      expect(ghostTrack.style.getPropertyValue('--ghost-end-left')).not.toBe('50%');
      expect(ghostTrack.style.getPropertyValue('--ghost-end-top')).not.toBe('50%');
    });
  });

  test('maps browser click target from coordinate_x/coordinate_y payload fields', async () => {
    const { container } = await renderToolCallGhost({
      userText: 'click text',
      toolText: JSON.stringify({
        name: 'browser',
        arguments: {
          action: 'click',
          explanation: 'Clicking some text',
          coordinate_x: 960,
          coordinate_y: 540,
        },
        metadata: {
          coordinate_contract: {
            target_display_size: [1920, 1080],
          },
        },
      }),
    });

    const ghostTrack = container.querySelector('.chatbox-tool-ghost-track');
    expect(ghostTrack).toBeTruthy();
    expect(ghostTrack.classList.contains('is-targeted')).toBe(true);
    expect(ghostTrack.classList.contains('is-click-animating')).toBe(true);
    expect(ghostTrack.style.getPropertyValue('--ghost-end-left')).toBe('50%');
    expect(ghostTrack.style.getPropertyValue('--ghost-end-top')).toBe('50%');
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
    expect(ghostTrack.style.getPropertyValue('--ghost-end-left')).not.toBe('50%');
    expect(ghostTrack.style.getPropertyValue('--ghost-end-top')).not.toBe('50%');
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
});
