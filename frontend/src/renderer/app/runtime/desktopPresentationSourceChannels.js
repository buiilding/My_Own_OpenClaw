/**
 * Names renderer presentation source channels without coupling them to IPC names.
 */

const SDK_CONVERSATION_EVENT_SOURCE_CHANNEL = 'sdk:conversation-event';
const SDK_CURRENT_TURN_SOURCE_CHANNEL = 'sdk:current-turn';
const SDK_CONVERSATION_VIEW_SOURCE_CHANNEL = 'sdk:conversation-view';
const SDK_DISPLAY_ROWS_SOURCE_CHANNEL = 'sdk:display-rows';

function getSdkConversationEventSourceChannel() {
  return SDK_CONVERSATION_EVENT_SOURCE_CHANNEL;
}

function getSdkCurrentTurnSourceChannel() {
  return SDK_CURRENT_TURN_SOURCE_CHANNEL;
}

function getSdkConversationViewSourceChannel() {
  return SDK_CONVERSATION_VIEW_SOURCE_CHANNEL;
}

function getSdkDisplayRowsSourceChannel() {
  return SDK_DISPLAY_ROWS_SOURCE_CHANNEL;
}

function isSdkCurrentTurnSourceChannel(sourceChannel) {
  return sourceChannel === SDK_CURRENT_TURN_SOURCE_CHANNEL;
}

function isSdkConversationViewSourceChannel(sourceChannel) {
  return sourceChannel === SDK_CONVERSATION_VIEW_SOURCE_CHANNEL;
}

function isSdkLiveTurnSourceChannel(sourceChannel) {
  return (
    isSdkCurrentTurnSourceChannel(sourceChannel)
    || isSdkConversationViewSourceChannel(sourceChannel)
  );
}

export const DesktopPresentationSourceChannels = Object.freeze({
  getSdkConversationEventSourceChannel,
  getSdkConversationViewSourceChannel,
  getSdkCurrentTurnSourceChannel,
  getSdkDisplayRowsSourceChannel,
  isSdkConversationViewSourceChannel,
  isSdkCurrentTurnSourceChannel,
  isSdkLiveTurnSourceChannel,
});
