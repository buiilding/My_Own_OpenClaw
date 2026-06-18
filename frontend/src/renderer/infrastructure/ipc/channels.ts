/**
 * Typed IPC channel constants.
 * Values come from the shared preload/main registry so renderer and preload stay in sync.
 */

import sharedIpcChannels from '../../../shared/ipcChannels.json';

const EXPECTED_SHARED_CHANNEL_KEYS = {
  SEND_CHANNELS: [
    'RENDERER_LOG',
    'LIVE_SURFACE_TRACE',
    'DESKTOP_RUNTIME_PENDING_TURN',
    'TRANSCRIPT_SESSION_SYNC',
    'MOVE_CHATBOX_TO',
    'WAKEWORD_AUDIO_CHUNK',
    'WAKEWORD_ENABLE',
    'WAKEWORD_DISABLE',
  ],
  INVOKE_CHANNELS: [
    'DESKTOP_RUNTIME_INVOKE',
    'CAPTURE_SCREENSHOT_ATTACHMENT',
    'READ_ATTACHMENT_FILE',
    'RUN_BROWSER_ACTION',
    'UPLOAD_ARTIFACT',
    'FETCH_ARTIFACT_IMAGE',
    'GET_SYSTEM_STATE',
    'GET_CLIENT_USER_ID',
    'COPY_IMAGE_TO_CLIPBOARD',
    'SHOW_IMAGE_CONTEXT_MENU',
    'SET_CHATBOX_VISUAL_ANCHOR_HEIGHT',
    'SET_CHATBOX_HIT_TEST_ACTIVE',
    'SET_RESPONSEBOX_HIT_TEST_ACTIVE',
    'SET_RESPONSEBOX_SIZE',
    'SHOW_MAIN_WINDOW',
    'GET_MAIN_WINDOW_VISIBILITY',
    'SHOW_CHATBOX',
    'ACTIVATE_CHATBOX_TEXT_ENTRY',
    'HIDE_CHATBOX',
    'HANDOFF_SURFACE_FOR_COMPUTER_USE',
    'PREPARE_SURFACE_FOR_SCREENSHOT',
    'RESTORE_SURFACE_AFTER_SCREENSHOT',
    'GET_DISPLAYS',
    'LOAD_FRONTEND_CONFIG',
    'SAVE_FRONTEND_CONFIG',
    'LIST_AGENT_EXTENSIONS',
    'LIST_MCP_SERVERS',
    'SET_MCP_SERVER_ENABLED',
    'REFRESH_MCP_SERVERS',
    'LIST_PERMISSIONS',
    'CHECK_PERMISSIONS',
    'CHECK_PERMISSION',
    'RUN_PERMISSION_PROBE',
    'REQUEST_PERMISSION',
    'SET_ACTIVE_WORKSPACE',
    'WINDOW_MINIMIZE',
    'WINDOW_TOGGLE_MAXIMIZE',
    'WINDOW_CLOSE',
    'GET_LOCAL_RUNTIME_STATUS',
  ],
  ON_CHANNELS: [
    'DESKTOP_RUNTIME_ROWS',
    'DESKTOP_RUNTIME_STATUS',
    'DESKTOP_RUNTIME_CONVERSATION_EVENT',
    'DESKTOP_RUNTIME_MEMORY_STORE_CHANGED',
    'DESKTOP_RUNTIME_CONVERSATION_METADATA_INVALIDATED',
    'DESKTOP_RUNTIME_CURRENT_TURN',
    'DESKTOP_RUNTIME_PENDING_TURN',
    'TRANSCRIPT_SESSION_SYNC',
    'IPC_STATUS',
    'LOCAL_RUNTIME_STATUS',
    'LOG',
    'WAKEWORD_DETECTED',
    'WAKEWORD_STATUS',
    'WAKEWORD_TOGGLE',
    'WAKEWORD_STT_TRIGGER',
    'CHATBOX_FOCUS',
    'WORKSPACE_ACCESS_UPDATED',
    'MAIN_WINDOW_OPEN_TARGET',
    'RESPONSE_OVERLAY_PHASE',
    'BACKEND_SETTINGS_EVENT',
    'AGENT_CAPABILITY_EVENT',
    'AUDIO_CHUNK',
    'RESPONSE_OVERLAY_VISIBILITY',
  ],
} as const;

type ChannelFamilyFromKeys<TKeys extends readonly string[]> = {
  readonly [K in TKeys[number]]: string;
};

type SharedChannelRegistry = {
  readonly SEND_CHANNELS: ChannelFamilyFromKeys<typeof EXPECTED_SHARED_CHANNEL_KEYS.SEND_CHANNELS>;
  readonly INVOKE_CHANNELS: ChannelFamilyFromKeys<typeof EXPECTED_SHARED_CHANNEL_KEYS.INVOKE_CHANNELS>;
  readonly ON_CHANNELS: ChannelFamilyFromKeys<typeof EXPECTED_SHARED_CHANNEL_KEYS.ON_CHANNELS>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function describeInvalidValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

function validateChannelFamily<TKeys extends readonly string[]>(
  registry: Record<string, unknown>,
  familyName: keyof SharedChannelRegistry,
  expectedKeys: TKeys,
): void {
  const actualFamily = registry[familyName];
  if (!isRecord(actualFamily)) {
    throw new Error(`Invalid IPC channel registry: ${String(familyName)} must be an object`);
  }

  for (const key of expectedKeys) {
    const actualValue = actualFamily[key];
    if (typeof actualValue !== 'string' || actualValue.length === 0) {
      throw new Error(
        `Invalid IPC channel registry: ${String(familyName)}.${key} must be a non-empty string but received ${describeInvalidValue(actualValue)}`,
      );
    }
  }
}

function validateSharedChannelRegistry(value: unknown): SharedChannelRegistry {
  if (!isRecord(value)) {
    throw new Error('Invalid IPC channel registry: root must be an object');
  }

  validateChannelFamily(value, 'SEND_CHANNELS', EXPECTED_SHARED_CHANNEL_KEYS.SEND_CHANNELS);
  validateChannelFamily(value, 'INVOKE_CHANNELS', EXPECTED_SHARED_CHANNEL_KEYS.INVOKE_CHANNELS);
  validateChannelFamily(value, 'ON_CHANNELS', EXPECTED_SHARED_CHANNEL_KEYS.ON_CHANNELS);

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

export const DESKTOP_RUNTIME_SEND_CHANNELS = {
  PENDING_TURN: SEND_CHANNELS.DESKTOP_RUNTIME_PENDING_TURN,
} as const;

export const DESKTOP_RUNTIME_INVOKE_CHANNELS = {
  INVOKE: INVOKE_CHANNELS.DESKTOP_RUNTIME_INVOKE,
} as const;

export const DESKTOP_RUNTIME_ON_CHANNELS = {
  ROWS: ON_CHANNELS.DESKTOP_RUNTIME_ROWS,
  STATUS: ON_CHANNELS.DESKTOP_RUNTIME_STATUS,
  CONVERSATION_EVENT: ON_CHANNELS.DESKTOP_RUNTIME_CONVERSATION_EVENT,
  MEMORY_STORE_CHANGED: ON_CHANNELS.DESKTOP_RUNTIME_MEMORY_STORE_CHANGED,
  CONVERSATION_METADATA_INVALIDATED: ON_CHANNELS.DESKTOP_RUNTIME_CONVERSATION_METADATA_INVALIDATED,
  CURRENT_TURN: ON_CHANNELS.DESKTOP_RUNTIME_CURRENT_TURN,
  PENDING_TURN: ON_CHANNELS.DESKTOP_RUNTIME_PENDING_TURN,
} as const;

/**
 * Type-safe channel name types
 */
export type SendChannel = typeof SEND_CHANNELS[keyof typeof SEND_CHANNELS];
export type InvokeChannel = typeof INVOKE_CHANNELS[keyof typeof INVOKE_CHANNELS];
export type OnChannel = typeof ON_CHANNELS[keyof typeof ON_CHANNELS];
