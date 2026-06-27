/**
 * Covers app status context. behavior in the frontend test suite.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';

import { AppStatusContext, useAppStatusContext } from '../../src/renderer/app/providers/AppStatusContext';

describe('AppStatusContext', () => {
  test('useAppStatusContext throws outside AppStatusProvider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAppStatusContext())).toThrow(
      'useAppStatusContext must be used within an AppStatusProvider',
    );
    consoleSpy.mockRestore();
  });

  test('useAppStatusContext returns context value when provider exists', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppStatusContext.Provider value={{ saveStatus: 'idle', setSaving: jest.fn() }}>
        {children}
      </AppStatusContext.Provider>
    );

    const { result } = renderHook(() => useAppStatusContext(), { wrapper });

    expect(result.current).toEqual({
      saveStatus: 'idle',
      setSaving: expect.any(Function),
    });
  });
});
