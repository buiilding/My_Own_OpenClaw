/**
 * Typed IPC channel constants.
 * Centralizes all IPC channel names to prevent typos and enable type safety.
 */

/**
 * Channels for sending messages from renderer to main process (one-way)
 */
export const SEND_CHANNELS = {
  TO_BACKEND: 'to-backend',
  MOVE_CHATBOX_TO: 'move-chatbox-to',
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
  SEARCH_CONVERSATIONS: 'search-conversations',
  LIST_CONVERSATIONS: 'list-conversations',
  LIST_EPISODIC_MEMORIES: 'list-episodic-memories',
  GET_CONVERSATION: 'get-conversation',
  LIST_SEMANTIC_MEMORIES: 'list-semantic-memories',
  DELETE_EPISODIC_MEMORY: 'delete-episodic-memory',
  DELETE_CONVERSATION: 'delete-conversation',
  DELETE_SEMANTIC_MEMORY: 'delete-semantic-memory',
  STORE_TRANSCRIPT: 'store-transcript',
  GET_CLIENT_USER_ID: 'get-client-user-id',
  SET_OVERLAY_IGNORE_MOUSE: 'set-overlay-ignore-mouse',
  SET_RESPONSEBOX_SIZE: 'set-responsebox-size',
  SHOW_MAIN_WINDOW: 'show-main-window',
  SHOW_CHATBOX: 'show-chatbox',
  HIDE_CHATBOX: 'hide-chatbox',
  PREPARE_OVERLAY_TOOL_FOCUS: 'prepare-overlay-tool-focus',
  GET_DISPLAYS: 'get-displays',
  LOAD_FRONTEND_CONFIG: 'load-frontend-config',
  SAVE_FRONTEND_CONFIG: 'save-frontend-config',
  SET_AGENT_SUDO_ACCESS: 'set-agent-sudo-access',
  LIST_PERMISSIONS: 'list-permissions',
  CHECK_PERMISSIONS: 'check-permissions',
  CHECK_PERMISSION: 'check-permission',
  RUN_PERMISSION_PROBE: 'run-permission-probe',
  REQUEST_PERMISSION: 'request-permission',
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
  WAKEWORD_STT_TRIGGER: 'wakeword-stt-trigger',
  CHATBOX_FOCUS: 'chatbox-focus',
  MAIN_WINDOW_OPEN_TARGET: 'main-window-open-target',
  RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
  RESPONSE_OVERLAY_VISIBILITY: 'response-overlay-visibility',
} as const;

/**
 * Type-safe channel name types
 */
export type SendChannel = typeof SEND_CHANNELS[keyof typeof SEND_CHANNELS];
export type InvokeChannel = typeof INVOKE_CHANNELS[keyof typeof INVOKE_CHANNELS];
export type OnChannel = typeof ON_CHANNELS[keyof typeof ON_CHANNELS];
