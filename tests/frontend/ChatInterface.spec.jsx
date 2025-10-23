import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatInterface from '@components/ChatInterface';
import '@testing-library/jest-dom';

/**
 * Test suite for the ChatInterface component.
 */
describe('ChatInterface', () => {
  const mockMessages = [
    { text: 'Hello there!', sender: 'assistant' },
    { text: 'Hi! How are you?', sender: 'user' },
  ];

  /**
   * Test case to ensure messages are rendered correctly.
   */
  test('renders a list of messages', () => {
    render(<ChatInterface messages={mockMessages} onSendMessage={() => {}} />);

    expect(screen.getByText('Hello there!')).toBeInTheDocument();
    expect(screen.getByText('Hi! How are you?')).toBeInTheDocument();
  });

  /**
   * Test case to verify that the onSendMessage callback is called on form submission.
   */
  test('calls onSendMessage with the input text when the form is submitted', () => {
    const handleSendMessage = jest.fn();
    render(<ChatInterface messages={[]} onSendMessage={handleSendMessage} />);

    const input = screen.getByPlaceholderText('Type your message...');
    const button = screen.getByText('Send');
    const testMessage = 'This is a test message';

    fireEvent.change(input, { target: { value: testMessage } });
    fireEvent.click(button);

    expect(handleSendMessage).toHaveBeenCalledTimes(1);
    expect(handleSendMessage).toHaveBeenCalledWith(testMessage);
  });

  /**
   * Test case to ensure the input and button are disabled when isSending is true.
   */
  test('disables input and button when isSending is true', () => {
    render(
      <ChatInterface
        messages={[]}
        onSendMessage={() => {}}
        isSending={true}
      />
    );

    const input = screen.getByPlaceholderText('Type your message...');
    const button = screen.getByText('...'); // The button text changes to '...'

    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
  });
});
