/**
 * Names renderer presentation source channels without coupling them to IPC names.
 */

const SDK_CONVERSATION_EVENT_SOURCE_CHANNEL = 'sdk:conversation-event';
const SDK_CURRENT_TURN_SOURCE_CHANNEL = 'sdk:current-turn';
const SDK_DISPLAY_ROWS_SOURCE_CHANNEL = 'sdk:display-rows';

export function getSdkConversationEventSourceChannel() {
  return SDK_CONVERSATION_EVENT_SOURCE_CHANNEL;
}

export function getSdkCurrentTurnSourceChannel() {
  return SDK_CURRENT_TURN_SOURCE_CHANNEL;
}

export function getSdkDisplayRowsSourceChannel() {
  return SDK_DISPLAY_ROWS_SOURCE_CHANNEL;
}

export function isSdkCurrentTurnSourceChannel(sourceChannel) {
  return sourceChannel === SDK_CURRENT_TURN_SOURCE_CHANNEL;
}
