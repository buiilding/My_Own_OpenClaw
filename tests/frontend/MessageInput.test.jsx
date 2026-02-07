import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import MessageInput from '../../frontend/src/renderer/features/chat/components/MessageInput';

describe('MessageInput', () => {
  test('submits trimmed message text', () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isSending={false} />);

    const input = screen.getByLabelText('Type your message');
    fireEvent.change(input, { target: { value: '  hello world  ', selectionStart: 13 } });
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).toHaveBeenCalledWith('hello world');
    expect(input.value).toBe('');
  });

  test('does not submit whitespace-only messages', () => {
    const onSendMessage = jest.fn();
    render(<MessageInput onSendMessage={onSendMessage} isSending={false} />);

    const input = screen.getByLabelText('Type your message');
    fireEvent.change(input, { target: { value: '   ', selectionStart: 3 } });
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  test('blocks submit when isSending is true', () => {
    const onSendMessage = jest.fn();
    const { rerender } = render(<MessageInput onSendMessage={onSendMessage} isSending={false} />);

    const input = screen.getByLabelText('Type your message');
    fireEvent.change(input, { target: { value: 'hello', selectionStart: 5 } });

    rerender(<MessageInput onSendMessage={onSendMessage} isSending />);
    fireEvent.submit(input.closest('form'));

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '...' })).toBeDisabled();
  });
});
