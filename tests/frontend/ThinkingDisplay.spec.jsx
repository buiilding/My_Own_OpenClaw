import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ThinkingDisplay from '@components/ThinkingDisplay';

describe('ThinkingDisplay', () => {
  it('should not render when status is null or empty', () => {
    const { rerender } = render(<ThinkingDisplay status={null} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<ThinkingDisplay status="" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('should render the status message when provided', () => {
    render(<ThinkingDisplay status="Agent is thinking..." />);
    const statusElement = screen.getByText('Agent is thinking...');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement.tagName).toBe('P');
    expect(statusElement).toHaveClass('thinking-text');
  });

  it('should render a spinner element', () => {
    render(<ThinkingDisplay status="Loading..." />);
    const spinner = screen.getByText('Loading...').previousSibling;
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('thinking-spinner');
  });

  it('should have an accessible role for screen readers', () => {
    render(<ThinkingDisplay status="Processing request" />);
    // The parent div should have a role that indicates it's a live region
    const thinkingDisplay = screen.getByRole('status');
    expect(thinkingDisplay).toBeInTheDocument();
  });
});
