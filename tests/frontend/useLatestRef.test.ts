import { renderHook } from '@testing-library/react';

import { useLatestRef } from '../../frontend/src/renderer/infrastructure/hooks/useLatestRef';

describe('useLatestRef', () => {
  test('keeps stable ref identity while updating current value', () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 'first' },
    });

    const firstRef = result.current;
    expect(firstRef.current).toBe('first');

    rerender({ value: 'second' });

    expect(result.current).toBe(firstRef);
    expect(result.current.current).toBe('second');
  });
});
