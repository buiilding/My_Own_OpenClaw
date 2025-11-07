import { useEffect } from 'react';

/**
 * Custom hook for handling initial app configuration.
 * Requests the initial config from the backend on mount.
 *
 * @returns {Object} - Empty object (hook handles side effects only)
 */
export function useInitialConfig() {
  useEffect(() => {
    // Request the initial config from the backend
    window.ipc.send('to-backend', { type: 'load-settings' });
  }, []);

  return {};
}
