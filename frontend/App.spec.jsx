/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './src/renderer/App';

// Mock the ipc object provided by the preload script
beforeAll(() => {
  global.window.ipc = {
    send: jest.fn(),
    on: jest.fn(() => () => {}), // Return a cleanup function
    once: jest.fn(),
  };
});

describe('App Component', () => {
  test('renders the main heading', () => {
    render(<App />);

    // Check if the main heading "Desktop Assistant" is in the document
    const headingElement = screen.getByText(/Desktop Assistant/i);
    expect(headingElement).toBeInTheDocument();
  });

  test('displays "Disconnected" status initially', () => {
    render(<App />);

    // Check for the connection status text
    const statusElement = screen.getByText(/Backend Connection Status:/i);
    expect(statusElement).toBeInTheDocument();

    const disconnectedElement = screen.getByText(/Disconnected/i);
    expect(disconnectedElement).toBeInTheDocument();
  });
});
