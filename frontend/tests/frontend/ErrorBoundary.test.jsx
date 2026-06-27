/**
 * Covers error boundary. behavior in the frontend test suite.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import ErrorBoundary from '../../src/renderer/components/ErrorBoundary';

function ThrowingChild({ error }) {
  throw error;
}

describe('ErrorBoundary', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    consoleErrorSpy.mockRestore();
  });

  test('does not expose raw error details outside development', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('token sk-live-secret leaked from C:\\Users\\peter\\app.js');
    error.stack = 'Error: token sk-live-secret\n    at C:\\Users\\peter\\app.js:12:3';

    render(
      <ErrorBoundary>
        <ThrowingChild error={error} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText(/Diagnostic details were written to the application logs/i)).toBeInTheDocument();
    expect(screen.queryByText(/sk-live-secret/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/C:\\Users\\peter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/app\.js/i)).not.toBeInTheDocument();
  });

  test('keeps raw diagnostics visible in development', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('developer diagnostic');
    error.stack = 'Error: developer diagnostic\n    at Component.jsx:1:1';

    render(
      <ErrorBoundary>
        <ThrowingChild error={error} />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/developer diagnostic/i)).toBeInTheDocument();
    expect(screen.getByText(/Component\.jsx/i)).toBeInTheDocument();
  });
});
