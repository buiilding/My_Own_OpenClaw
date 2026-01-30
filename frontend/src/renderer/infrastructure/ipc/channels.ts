/**
 * Typed IPC channel constants.
 * Centralizes all IPC channel names to prevent typos and enable type safety.
 */

/**
 * Channels for sending messages from renderer to main process (one-way)
 */
export const SEND_CHANNELS = {
  TO_BACKEND: 'to-backend',
  WAKEWORD_AUDIO_CHUNK: 'wakeword-audio-chunk',
  WAKEWORD_ENABLE: 'wakeword-enable',
  WAKEWORD_DISABLE: 'wakeword-disable',
} as const;

/**
 * Channels for invoking async handlers (returns Promise)
 */
export const INVOKE_CHANNELS = {
  EXECUTE_TOOL: 'execute-tool',
  GET_SYSTEM_STATE: 'get-system-state',
  STORE_MEMORY: 'store-memory',
  SEARCH_MEMORY: 'search-memory',
  MINIMIZE_WINDOW_DELAYED: 'minimize-window-delayed',
} as const;

/**
 * Channels for receiving messages from main process (event listeners)
 */
export const ON_CHANNELS = {
  FROM_BACKEND: 'from-backend',
  IPC_STATUS: 'ipc-status',
  LOG: 'log',
  WAKEWORD_DETECTED: 'wakeword-detected',
  WAKEWORD_STATUS: 'wakeword-status',
} as const;

/**
 * Type-safe channel name types
 */
export type SendChannel = typeof SEND_CHANNELS[keyof typeof SEND_CHANNELS];
export type InvokeChannel = typeof INVOKE_CHANNELS[keyof typeof INVOKE_CHANNELS];
export type OnChannel = typeof ON_CHANNELS[keyof typeof ON_CHANNELS];
