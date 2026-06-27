/**
 * Covers assistant message actions. behavior in the frontend test suite.
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';

import AssistantMessageActions from '../../src/renderer/features/chat/components/message/AssistantMessageActions';

describe('AssistantMessageActions', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('restarts the reveal delay when a visible message id changes', () => {
    jest.useFakeTimers();

    const { rerender } = render(
      <AssistantMessageActions
        messageId="assistant-1"
        messageText="first"
        visible
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy assistant message' })).toBeInTheDocument();

    rerender(
      <AssistantMessageActions
        messageId="assistant-2"
        messageText="second"
        visible
      />,
    );

    expect(screen.getByTestId('assistant-message-actions-placeholder')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy assistant message' })).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(screen.queryByRole('button', { name: 'Copy assistant message' })).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByRole('button', { name: 'Copy assistant message' })).toBeInTheDocument();
  });
});
