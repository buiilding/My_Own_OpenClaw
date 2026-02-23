/**
 * Typed IPC channel constants.
 * Centralizes all IPC channel names to prevent typos and enable type safety.
 */

/**
 * Channels for sending messages from renderer to main process (one-way)
 */
export const SEND_CHANNELS = {
  TO_BACKEND: 'to-backend',
  MOVE_CHATBOX_BY: 'move-chatbox-by',
  WAKEWORD_AUDIO_CHUNK: 'wakeword-audio-chunk',
  WAKEWORD_ENABLE: 'wakeword-enable',
  WAKEWORD_DISABLE: 'wakeword-disable',
} as const;

/**
 * Channels for invoking async handlers (returns Promise)
 */
export const INVOKE_CHANNELS = {
  EXECUTE_TOOL: 'execute-tool',
  UPLOAD_ARTIFACT: 'upload-artifact',
  GET_SYSTEM_STATE: 'get-system-state',
  STORE_MEMORY: 'store-memory',
  SEARCH_MEMORY: 'search-memory',
  LIST_CONVERSATIONS: 'list-conversations',
  GET_CONVERSATION: 'get-conversation',
  LIST_SEMANTIC_MEMORIES: 'list-semantic-memories',
  DELETE_CONVERSATION: 'delete-conversation',
  DELETE_SEMANTIC_MEMORY: 'delete-semantic-memory',
  STORE_TRANSCRIPT: 'store-transcript',
  GET_CLIENT_USER_ID: 'get-client-user-id',
  SET_OVERLAY_IGNORE_MOUSE: 'set-overlay-ignore-mouse',
  SET_CHATBOX_SIZE: 'set-chatbox-size',
  SET_RESPONSEBOX_SIZE: 'set-responsebox-size',
  SHOW_MAIN_WINDOW: 'show-main-window',
  SHOW_CHATBOX: 'show-chatbox',
  HIDE_CHATBOX: 'hide-chatbox',
  GET_DISPLAYS: 'get-displays',
  LOAD_FRONTEND_CONFIG: 'load-frontend-config',
  SAVE_FRONTEND_CONFIG: 'save-frontend-config',
  WINDOW_MINIMIZE: 'window-minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window-toggle-maximize',
  WINDOW_CLOSE: 'window-close',
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
  WAKEWORD_TOGGLE: 'wakeword-toggle',
  CHATBOX_FOCUS: 'chatbox-focus',
  RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
} as const;

/**
 * Type-safe channel name types
 */
export type SendChannel = typeof SEND_CHANNELS[keyof typeof SEND_CHANNELS];
export type InvokeChannel = typeof INVOKE_CHANNELS[keyof typeof INVOKE_CHANNELS];
export type OnChannel = typeof ON_CHANNELS[keyof typeof ON_CHANNELS];
