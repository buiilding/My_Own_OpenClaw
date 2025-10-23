/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../../frontend/src/renderer/App';
import '@testing-library/jest-dom';

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
});
