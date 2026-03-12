/**
 * Typed IPC channel constants.
 * Values come from the shared preload/main registry so renderer and preload stay in sync.
 */

import sharedIpcChannels from '../../../shared/ipcChannels.json';

type SharedChannelRegistry = {
  SEND_CHANNELS: {
    TO_BACKEND: 'to-backend';
    TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync';
    MOVE_CHATBOX_TO: 'move-chatbox-to';
    WAKEWORD_AUDIO_CHUNK: 'wakeword-audio-chunk';
    WAKEWORD_ENABLE: 'wakeword-enable';
    WAKEWORD_DISABLE: 'wakeword-disable';
  };
  INVOKE_CHANNELS: {
    EXECUTE_TOOL: 'execute-tool';
    UPLOAD_ARTIFACT: 'upload-artifact';
    GET_SYSTEM_STATE: 'get-system-state';
    STORE_MEMORY: 'store-memory';
    SEARCH_MEMORY: 'search-memory';
    SEARCH_CONVERSATIONS: 'search-conversations';
    LIST_CONVERSATIONS: 'list-conversations';
    LIST_EPISODIC_MEMORIES: 'list-episodic-memories';
    GET_CONVERSATION: 'get-conversation';
    LIST_SEMANTIC_MEMORIES: 'list-semantic-memories';
    DELETE_EPISODIC_MEMORY: 'delete-episodic-memory';
    DELETE_CONVERSATION: 'delete-conversation';
    DELETE_SEMANTIC_MEMORY: 'delete-semantic-memory';
    CLEAR_LOCAL_MEMORY: 'clear-local-memory';
    CLEAR_CHAT_HISTORY: 'clear-chat-history';
    STORE_TRANSCRIPT: 'store-transcript';
    GET_CLIENT_USER_ID: 'get-client-user-id';
    SET_CHATBOX_VISUAL_ANCHOR_HEIGHT: 'set-chatbox-visual-anchor-height';
    SET_CHATBOX_HIT_TEST_ACTIVE: 'set-chatbox-hit-test-active';
    SET_RESPONSEBOX_SIZE: 'set-responsebox-size';
    SHOW_MAIN_WINDOW: 'show-main-window';
    GET_MAIN_WINDOW_VISIBILITY: 'get-main-window-visibility';
    SHOW_CHATBOX: 'show-chatbox';
    HIDE_CHATBOX: 'hide-chatbox';
    HANDOFF_SURFACE_FOR_COMPUTER_USE: 'handoff-surface-for-computer-use';
    PREPARE_SURFACE_FOR_SCREENSHOT: 'prepare-surface-for-screenshot';
    RESTORE_SURFACE_AFTER_SCREENSHOT: 'restore-surface-after-screenshot';
    GET_DISPLAYS: 'get-displays';
    LOAD_FRONTEND_CONFIG: 'load-frontend-config';
    SAVE_FRONTEND_CONFIG: 'save-frontend-config';
    OPENAI_CODEX_OAUTH_LOGIN: 'openai-codex-oauth-login';
    OPENAI_CODEX_OAUTH_LOGOUT: 'openai-codex-oauth-logout';
    SET_AGENT_SUDO_ACCESS: 'set-agent-sudo-access';
    LIST_PERMISSIONS: 'list-permissions';
    CHECK_PERMISSIONS: 'check-permissions';
    CHECK_PERMISSION: 'check-permission';
    RUN_PERMISSION_PROBE: 'run-permission-probe';
    REQUEST_PERMISSION: 'request-permission';
    WINDOW_MINIMIZE: 'window-minimize';
    WINDOW_TOGGLE_MAXIMIZE: 'window-toggle-maximize';
    WINDOW_CLOSE: 'window-close';
  };
  ON_CHANNELS: {
    FROM_BACKEND: 'from-backend';
    TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync';
    IPC_STATUS: 'ipc-status';
    LOG: 'log';
    WAKEWORD_DETECTED: 'wakeword-detected';
    WAKEWORD_STATUS: 'wakeword-status';
    WAKEWORD_TOGGLE: 'wakeword-toggle';
    WAKEWORD_STT_TRIGGER: 'wakeword-stt-trigger';
    CHATBOX_FOCUS: 'chatbox-focus';
    MAIN_WINDOW_OPEN_TARGET: 'main-window-open-target';
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase';
    RESPONSE_OVERLAY_VISIBILITY: 'response-overlay-visibility';
  };
};

const typedChannels = sharedIpcChannels as SharedChannelRegistry;

/**
 * Channels for sending messages from renderer to main process (one-way)
 */
export const SEND_CHANNELS = typedChannels.SEND_CHANNELS;

/**
 * Channels for invoking async handlers (returns Promise)
 */
export const INVOKE_CHANNELS = typedChannels.INVOKE_CHANNELS;

/**
 * Channels for receiving messages from main process (event listeners)
 */
export const ON_CHANNELS = typedChannels.ON_CHANNELS;

/**
 * Type-safe channel name types
 */
export type SendChannel = typeof SEND_CHANNELS[keyof typeof SEND_CHANNELS];
export type InvokeChannel = typeof INVOKE_CHANNELS[keyof typeof INVOKE_CHANNELS];
export type OnChannel = typeof ON_CHANNELS[keyof typeof ON_CHANNELS];
