import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ToolGhostVisualTestApp from '../../frontend/src/renderer/app/ToolGhostVisualTestApp';
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../../frontend/src/renderer/features/chat/constants/toolGhostRuntime';

describe('ToolGhostVisualTestApp', () => {
  test('plays ghost animation and hides after full timeline', () => {
    jest.useFakeTimers();
    try {
      render(<ToolGhostVisualTestApp />);
      expect(screen.getByText('Ghost hidden. Press "Play Ghost Animation".')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Play Ghost Animation' }));
      expect(screen.getByLabelText('Ghost cursor visual test')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(TOOL_GHOST_CLICK_SYNC_DELAY_MS - 1);
      });
      expect(screen.getByLabelText('Ghost cursor visual test')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.queryByLabelText('Ghost cursor visual test')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
