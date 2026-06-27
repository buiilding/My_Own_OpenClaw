/**
 * Covers thinking display. behavior in the frontend test suite.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ThinkingDisplay from '../../src/renderer/features/chat/components/message/ThinkingDisplay';
import { DesktopDevUiRuntime } from '../../src/renderer/app/runtime/desktopDevUiRuntime';

jest.mock('../../src/renderer/app/runtime/desktopDevUiRuntime', () => ({
  DesktopDevUiRuntime: {
    isDevUiEnabled: jest.fn(),
  },
}));

describe('ThinkingDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DesktopDevUiRuntime.isDevUiEnabled.mockReturnValue(false);
  });

  test('renders nothing for empty status', () => {
    const { container } = render(<ThinkingDisplay status={null} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders transparent reasoning stream text', async () => {
    render(<ThinkingDisplay status={'step 1\nstep 2'} />);
    await waitFor(() => {
      expect(screen.getByLabelText('Assistant reasoning stream')).toBeInTheDocument();
    });
    expect(screen.getByText(/step 1/)).toBeInTheDocument();
  });

  test('shows top overflow affordance when stream is scrolled above bottom', async () => {
    const { container } = render(<ThinkingDisplay status={'line 1\nline 2\nline 3\nline 4'} />);
    const streamEl = container.querySelector('.thinking-display-stream');
    expect(streamEl).toBeTruthy();

    Object.defineProperty(streamEl, 'scrollHeight', {
      value: 480,
      configurable: true,
    });
    Object.defineProperty(streamEl, 'clientHeight', {
      value: 140,
      configurable: true,
    });
    Object.defineProperty(streamEl, 'scrollTop', {
      value: 72,
      writable: true,
      configurable: true,
    });

    fireEvent.scroll(streamEl);

    await waitFor(() => {
      expect(streamEl.classList.contains('has-overflow-above')).toBe(true);
    });
  });

  test('renders runtime-provided thinking source badge when dev ui is enabled', async () => {
    DesktopDevUiRuntime.isDevUiEnabled.mockReturnValue(true);

    render(<ThinkingDisplay status="step 1" sourceEventType="assistant_delta" />);

    expect(await screen.findByText('assistant_delta event / sdk:conversation-event')).toHaveAttribute(
      'title',
      'source_event=assistant_delta',
    );
  });
});

