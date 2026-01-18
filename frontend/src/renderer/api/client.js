/**
 * Typed API Client for backend communication.
 * Mirrors backend/src/api/schema.py
 */

export const ApiClient = {
  /**
   * Send a user query to the backend
   * @param {string} text
   */
  sendQuery: async (text) => {
    // System state and memories are automatically added by ipc.cjs
    window.ipc.send('to-backend', {
      type: 'query',
      payload: {
        text
      }
    });
  },

  /**
   * Update application settings
   * @param {object} settings 
   */
  updateSettings: (settings) => {
    window.ipc.send('to-backend', {
      type: 'update-settings',
      payload: settings
    });
  },

  /**
   * Request a list of available LLM models
   */
  listModels: () => {
    window.ipc.send('to-backend', {
      type: 'list-models'
    });
  },

  /**
   * Request current settings
   */
  loadSettings: () => {
    window.ipc.send('to-backend', {
      type: 'load-settings'
    });
  },

  /**
   * Notify backend that wakeword was detected
   */
  wakewordDetected: () => {
    window.ipc.send('to-backend', {
      type: 'wakeword-detected',
      payload: {}
    });
  }
};

