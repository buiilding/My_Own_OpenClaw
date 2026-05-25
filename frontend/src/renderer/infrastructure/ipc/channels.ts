/**
 * Typed IPC channel constants.
 * Values come from the shared preload/main registry so renderer and preload stay in sync.
 */

import sharedIpcChannels from '../../../shared/ipcChannels.json';

export const EXPECTED_SHARED_CHANNEL_REGISTRY = {
  SEND_CHANNELS: {
    TO_BACKEND: 'to-backend',
    RENDERER_LOG: 'renderer-log',
    TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync',
    MOVE_CHATBOX_TO: 'move-chatbox-to',
    WAKEWORD_AUDIO_CHUNK: 'wakeword-audio-chunk',
    WAKEWORD_ENABLE: 'wakeword-enable',
    WAKEWORD_DISABLE: 'wakeword-disable',
  },
  INVOKE_CHANNELS: {
    SEND_CHAT_QUERY: 'send-chat-query',
    STOP_CHAT_QUERY: 'stop-chat-query',
    CAPTURE_SCREENSHOT_ATTACHMENT: 'capture-screenshot-attachment',
    READ_ATTACHMENT_FILE: 'read-attachment-file',
    RUN_BROWSER_ACTION: 'run-browser-action',
    UPLOAD_ARTIFACT: 'upload-artifact',
    FETCH_ARTIFACT_IMAGE: 'fetch-artifact-image',
    GET_SYSTEM_STATE: 'get-system-state',
    STORE_MEMORY: 'store-memory',
    SEARCH_MEMORY: 'search-memory',
    LIST_EPISODIC_MEMORIES: 'list-episodic-memories',
    LIST_SEMANTIC_MEMORIES: 'list-semantic-memories',
    DELETE_EPISODIC_MEMORY: 'delete-episodic-memory',
    DELETE_SEMANTIC_MEMORY: 'delete-semantic-memory',
    CLEAR_LOCAL_MEMORY: 'clear-local-memory',
    CLEAR_CHAT_HISTORY: 'clear-chat-history',
    STORE_CHAT_EVENT: 'store-chat-event',
    REPLACE_CHAT_CONVERSATION: 'replace-chat-conversation',
    LIST_CHAT_CONVERSATIONS: 'list-chat-conversations',
    SEARCH_CHAT_CONVERSATIONS: 'search-chat-conversations',
    GET_CHAT_EVENTS: 'get-chat-events',
    GET_CHAT_CONVERSATION_REVISION: 'get-chat-conversation-revision',
    DELETE_CHAT_CONVERSATION: 'delete-chat-conversation',
    GET_CLIENT_USER_ID: 'get-client-user-id',
    COPY_IMAGE_TO_CLIPBOARD: 'copy-image-to-clipboard',
    SHOW_IMAGE_CONTEXT_MENU: 'show-image-context-menu',
    SET_CHATBOX_VISUAL_ANCHOR_HEIGHT: 'set-chatbox-visual-anchor-height',
    SET_CHATBOX_HIT_TEST_ACTIVE: 'set-chatbox-hit-test-active',
    SET_RESPONSEBOX_SIZE: 'set-responsebox-size',
    PRIME_RESPONSE_OVERLAY_AWAITING: 'prime-response-overlay-awaiting',
    SHOW_MAIN_WINDOW: 'show-main-window',
    GET_MAIN_WINDOW_VISIBILITY: 'get-main-window-visibility',
    SHOW_CHATBOX: 'show-chatbox',
    HIDE_CHATBOX: 'hide-chatbox',
    HANDOFF_SURFACE_FOR_COMPUTER_USE: 'handoff-surface-for-computer-use',
    PREPARE_SURFACE_FOR_SCREENSHOT: 'prepare-surface-for-screenshot',
    RESTORE_SURFACE_AFTER_SCREENSHOT: 'restore-surface-after-screenshot',
    GET_DISPLAYS: 'get-displays',
    LOAD_FRONTEND_CONFIG: 'load-frontend-config',
    SAVE_FRONTEND_CONFIG: 'save-frontend-config',
    LIST_AGENT_EXTENSIONS: 'list-agent-extensions',
    OPENAI_CODEX_OAUTH_LOGIN: 'openai-codex-oauth-login',
    OPENAI_CODEX_OAUTH_LOGOUT: 'openai-codex-oauth-logout',
    SET_AGENT_SUDO_ACCESS: 'set-agent-sudo-access',
    LIST_PERMISSIONS: 'list-permissions',
    CHECK_PERMISSIONS: 'check-permissions',
    CHECK_PERMISSION: 'check-permission',
    RUN_PERMISSION_PROBE: 'run-permission-probe',
    REQUEST_PERMISSION: 'request-permission',
    SET_ACTIVE_WORKSPACE: 'set-active-workspace',
    WINDOW_MINIMIZE: 'window-minimize',
    WINDOW_TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    WINDOW_CLOSE: 'window-close',
    GET_LOCAL_BACKEND_STATUS: 'get-local-backend-status',
  },
  ON_CHANNELS: {
    FROM_BACKEND: 'from-backend',
    TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync',
    SIDECAR_EVENT: 'sidecar-event',
    IPC_STATUS: 'ipc-status',
    LOCAL_BACKEND_STATUS: 'local-backend-status',
    LOG: 'log',
    WAKEWORD_DETECTED: 'wakeword-detected',
    WAKEWORD_STATUS: 'wakeword-status',
    WAKEWORD_TOGGLE: 'wakeword-toggle',
    WAKEWORD_STT_TRIGGER: 'wakeword-stt-trigger',
    CHATBOX_FOCUS: 'chatbox-focus',
    WORKSPACE_ACCESS_UPDATED: 'workspace-access-updated',
    MAIN_WINDOW_OPEN_TARGET: 'main-window-open-target',
    RESPONSE_OVERLAY_PHASE: 'response-overlay-phase',
    CONVERSATION_RUNTIME_UPDATED: 'conversation-runtime-updated',
    CONVERSATION_EVENT: 'conversation-event',
    BACKEND_SETTINGS_EVENT: 'backend-settings-event',
    AGENT_CAPABILITY_EVENT: 'agent-capability-event',
    AUDIO_CHUNK: 'audio-chunk',
    RESPONSE_OVERLAY_VISIBILITY: 'response-overlay-visibility',
  },
} as const;

type SharedChannelRegistry = typeof EXPECTED_SHARED_CHANNEL_REGISTRY;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function describeInvalidValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

function validateChannelFamily<TExpected extends Record<string, string>>(
  registry: Record<string, unknown>,
  familyName: keyof SharedChannelRegistry,
  expected: TExpected,
): void {
  const actualFamily = registry[familyName];
  if (!isRecord(actualFamily)) {
    throw new Error(`Invalid IPC channel registry: ${String(familyName)} must be an object`);
  }

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actualFamily[key];
    if (actualValue !== expectedValue) {
      throw new Error(
        `Invalid IPC channel registry: ${String(familyName)}.${key} expected "${expectedValue}" but received ${describeInvalidValue(actualValue)}`,
      );
    }
  }
}

export function validateSharedChannelRegistry(value: unknown): SharedChannelRegistry {
  if (!isRecord(value)) {
    throw new Error('Invalid IPC channel registry: root must be an object');
  }

  validateChannelFamily(value, 'SEND_CHANNELS', EXPECTED_SHARED_CHANNEL_REGISTRY.SEND_CHANNELS);
  validateChannelFamily(value, 'INVOKE_CHANNELS', EXPECTED_SHARED_CHANNEL_REGISTRY.INVOKE_CHANNELS);
  validateChannelFamily(value, 'ON_CHANNELS', EXPECTED_SHARED_CHANNEL_REGISTRY.ON_CHANNELS);

  return value as SharedChannelRegistry;
}

const typedChannels = validateSharedChannelRegistry(sharedIpcChannels);

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
