import React from 'react';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '@components/ErrorBoundary';

// Mock console.error to prevent logging during tests
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.error.mockRestore();
});

// A component that throws an error
const ProblemChild = () => {
  throw new Error('Test error');
};

describe('ErrorBoundary', () => {
  it('should render children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child component</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child component')).toBeInTheDocument();
  });

  it('should render the fallback UI when a child component throws an error', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    // Check for fallback UI text
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    // Check that the error message is present
    expect(screen.getByText(/Test error/)).toBeInTheDocument();
  });

  it('should call console.error when an error is caught', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(console.error).toHaveBeenCalled();
  });
});
