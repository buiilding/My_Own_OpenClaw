import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ThinkingDisplay from '../../frontend/src/renderer/features/chat/components/message/ThinkingDisplay';

describe('ThinkingDisplay', () => {
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
});

