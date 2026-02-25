import React from 'react';
import { act, render, screen } from '@testing-library/react';
import ToolGhostDebugApp from '../../frontend/src/renderer/app/ToolGhostDebugApp';
import { TOOL_GHOST_CLICK_SYNC_DELAY_MS } from '../../frontend/src/renderer/features/chat/constants/toolGhostRuntime';

describe('ToolGhostDebugApp', () => {
  test('shows only ghost animation and hides after one timeline', () => {
    jest.useFakeTimers();
    try {
      render(<ToolGhostDebugApp />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Ghost cursor debug animation')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(TOOL_GHOST_CLICK_SYNC_DELAY_MS - 1);
      });
      expect(screen.getByLabelText('Ghost cursor debug animation')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.queryByLabelText('Ghost cursor debug animation')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
