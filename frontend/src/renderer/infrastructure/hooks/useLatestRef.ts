import { useRef } from 'react';

/**
 * Returns a stable ref object whose `.current` value always reflects the latest
 * render value without requiring an effect subscription.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
