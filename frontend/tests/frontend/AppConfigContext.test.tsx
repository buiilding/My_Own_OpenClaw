/**
 * Covers app config context. behavior in the frontend test suite.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';

import { AppConfigContext, useAppConfigContext } from '../../src/renderer/app/providers/AppConfigContext';

describe('AppConfigContext', () => {
  test('useAppConfigContext throws outside AppConfigProvider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAppConfigContext())).toThrow(
      'useAppConfigContext must be used within an AppConfigProvider',
    );
    consoleSpy.mockRestore();
  });

  test('useAppConfigContext returns context value when provider exists', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppConfigContext.Provider value={{ updateConfig: jest.fn(), config: { a: 1 } }}>
        {children}
      </AppConfigContext.Provider>
    );

    const { result } = renderHook(() => useAppConfigContext(), { wrapper });

    expect(result.current).toEqual({
      updateConfig: expect.any(Function),
      config: { a: 1 },
    });
  });
});
