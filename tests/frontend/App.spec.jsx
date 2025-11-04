/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '@/renderer/App';
import '@testing-library/jest-dom';

// Mock the ipc object
jest.mock('@/main/ipc.cjs', () => ({
  on: jest.fn(),
  send: jest.fn(),
}));


// Mock the global window.ipc object that Electron provides
beforeAll(() => {
  global.window.ipc = {
    send: jest.fn(),
    on: jest.fn(() => () => {}), // Return a cleanup function
  };
});

/**
 * Test suite for the main App component.
 */
describe('App', () => {
  /**
   * Test case to ensure the App component renders the initial message.
   */
  test('renders the initial welcome message', () => {
    render(<App />);

    // Check that the initial message from the assistant is present
    const welcomeMessage = screen.getByText('Hello! How can I help you today?');
    expect(welcomeMessage).toBeInTheDocument();

    // Check that the message has the correct class
    expect(welcomeMessage.closest('.message')).toHaveClass('message-assistant');
  });

  test('handles and accumulates thinking status updates', async () => {
    // Store the callback passed to window.ipc.on
    let ipcCallback;
    global.window.ipc.on.mockImplementation((channel, callback) => {
      if (channel === 'from-backend') {
        ipcCallback = callback;
      }
      return () => {}; // Return a cleanup function
    });

    render(<App />);

    // Enter a message first
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Test message' } });

    // Simulate sending a message to trigger the thinking process
    fireEvent.click(screen.getByText('Send'));

    // Simulate receiving thinking events from the backend
    act(() => {
      ipcCallback({
        type: 'llm-thought',
        payload: { status: 'Analyzing query... ' },
      });
    });

    let thinkingDisplay = screen.getByText(/Analyzing query.../);
    expect(thinkingDisplay).toBeInTheDocument();

    act(() => {
      ipcCallback({
        type: 'llm-thought',
        payload: { status: 'Searching memory...' },
      });
    });

    // The text should now be accumulated
    thinkingDisplay = screen.getByText(/Analyzing query... Searching memory.../);
    expect(thinkingDisplay).toBeInTheDocument();

    // Simulate the start of the actual response
    act(() => {
      ipcCallback({
        type: 'streaming-response',
        payload: { text: 'Here is the answer.' },
      });
    });

    // The thinking display should disappear
    expect(screen.queryByText(/Searching memory/)).not.toBeInTheDocument();
  });
});
